import { describe, expect, it } from 'vitest';
import { bestContacts, looksLikeFranchise, brDomainOf, extractEmails, parseBrasilApi, parseCnpjWs, parseRdap, whatsappFromHref } from '../src/enrichment';

// Resposta real do RDAP do registro.br (draevelyncampos.com.br), resumida.
const vcard = (fn: string, email?: string) => ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', fn], ...(email ? [['email', {}, 'text', email]] : [])]];
const rdap = {
  entities: [
    {
      roles: ['registrant'], vcardArray: vcard('Campos Odontologia'), publicIds: [{ type: 'cnpj', identifier: '43.047.454/0001-20' }],
      entities: [{ roles: ['administrative'], vcardArray: vcard('Evelyn Balthazar de Campos Prianti', 'AdsGrupoIcom@gmail.com') }],
    },
    { roles: ['technical'], vcardArray: vcard('Roberto Wagner Barros Bueno', 'icomdominios@icom.com.br') },
  ],
};

describe('brDomainOf', () => {
  it('acha o domínio registrável .br', () => {
    expect(brDomainOf('https://www.draevelyncampos.com.br/contato')).toBe('draevelyncampos.com.br');
    expect(brDomainOf('agenda.clinica.odo.br')).toBe('clinica.odo.br');
    expect(brDomainOf('http://nome.br')).toBe('nome.br');
  });
  it('ignora o que não é .br', () => {
    expect(brDomainOf('https://clinica.com')).toBeNull();
    expect(brDomainOf(null)).toBeNull();
    expect(brDomainOf('não é url')).toBeNull();
  });
});

describe('parseRdap', () => {
  it('lê titular, CNPJ, pessoas e e-mails, marcando o técnico', () => {
    const out = parseRdap(rdap);
    expect(out.cnpj).toBe('43047454000120');
    expect(out.holder).toBe('Campos Odontologia');
    expect(out.people.map((p) => p.name)).toEqual(['Campos Odontologia', 'Evelyn Balthazar de Campos Prianti', 'Roberto Wagner Barros Bueno']);
    expect(out.emails).toEqual([
      { email: 'adsgrupoicom@gmail.com', source: 'whois', note: 'Contato administrativo do domínio' },
      { email: 'icomdominios@icom.com.br', source: 'whois', note: 'Contato técnico (costuma ser a agência)' },
    ]);
  });
  it('aguenta resposta vazia', () => {
    expect(parseRdap(null)).toEqual({ cnpj: null, holder: null, people: [], emails: [] });
  });
});

describe('CNPJ', () => {
  it('lê a BrasilAPI', () => {
    const out = parseBrasilApi({
      cnpj: '43047454000120', razao_social: 'CAMPOS ODONTOLOGIA E IMAGEM LTDA', nome_fantasia: 'CAMPOS ODONTOLOGIA',
      descricao_situacao_cadastral: 'ATIVA', cnae_fiscal_descricao: 'Atividade odontológica', email: null,
      ddd_telefone_1: '1233222183', ddd_telefone_2: '12991234567',
      qsa: [{ nome_socio: 'EVELYN BALTHAZAR DE CAMPOS PRIANTI', qualificacao_socio: 'Sócio-Administrador' }],
    })!;
    expect(out.company.legal_name).toBe('Campos Odontologia e Imagem Ltda');
    expect(out.phones).toEqual([
      { e164: '551233222183', source: 'cnpj', mobile: false },
      { e164: '5512991234567', source: 'cnpj', mobile: true },
    ]);
    expect(out.emails).toEqual([]);
    expect(out.people[0]).toEqual({ name: 'Evelyn Balthazar de Campos Prianti', role: 'Sócio-Administrador', source: 'cnpj' });
  });
  it('lê o e-mail do CNPJ.ws', () => {
    const out = parseCnpjWs({ estabelecimento: { email: 'Contato@Clinica.com.br', ddd1: '12', telefone1: '33222183' } });
    expect(out.emails[0].email).toBe('contato@clinica.com.br');
    expect(out.phones[0].mobile).toBe(false);
  });
});

describe('site', () => {
  it('tira e-mails do texto sem falsos positivos', () => {
    expect(extractEmails('Fale: Contato@Clinica.com.br. logo@2x.png mailto:contato@clinica.com.br x@sentry.io')).toEqual(['contato@clinica.com.br']);
  });
  it('lê o celular de links de WhatsApp', () => {
    expect(whatsappFromHref('https://wa.me/5512991234567?text=oi')).toBe('5512991234567');
    expect(whatsappFromHref('https://api.whatsapp.com/send?phone=5512991234567')).toBe('5512991234567');
    expect(whatsappFromHref('https://wa.me/551233222183')).toBeNull();
  });
});

describe('bestContacts', () => {
  it('prefere o site, pula o contato técnico e usa só celular', () => {
    const out = bestContacts({
      emails: [
        { email: 'agencia@x.com', source: 'whois', note: 'Contato técnico (costuma ser a agência)' },
        { email: 'contador@y.com', source: 'cnpj', note: null },
        { email: 'dono@z.com', source: 'whois', note: 'Contato administrativo do domínio' },
      ],
      phones: [{ e164: '551233222183', source: 'cnpj', mobile: false }, { e164: '5512991234567', source: 'cnpj', mobile: true }],
    });
    expect(out).toEqual({ email: 'dono@z.com', mobile: '5512991234567' });
  });
  it('não conta o e-mail da agência como contato', () => {
    expect(bestContacts({ emails: [{ email: 'a@x.com', source: 'whois', note: 'Contato técnico (costuma ser a agência)' }], phones: [] }).email).toBeNull();
  });
});

describe('pessoas do WHOIS', () => {
  it('junta a mesma pessoa em vários papéis e arruma maiúsculas', () => {
    const v = (fn: string) => ['vcard', [['fn', {}, 'text', fn]]];
    const out = parseRdap({ entities: [
      { roles: ['registrant'], vcardArray: v('EDSON HILGERT'), entities: [{ roles: ['administrative'], vcardArray: v('EDSON  HILGERT') }, { roles: ['technical'], vcardArray: v('Edson Hilgert') }] },
    ] });
    expect(out.people).toEqual([{ name: 'Edson Hilgert', role: 'Titular, administrativo, técnico do domínio', source: 'whois' }]);
  });
});

describe('looksLikeFranchise', () => {
  it('reconhece franquia pela razão social', () => {
    expect(looksLikeFranchise({ company: { cnpj: '1', legal_name: 'Dso Dental Service Office Franquias', trade_name: null, status: null, activity: null }, people: [] })).toBe(true);
    expect(looksLikeFranchise({ company: null, people: [{ name: 'Clínica X', role: 'Titular do domínio', source: 'whois' }] })).toBe(false);
    expect(looksLikeFranchise(null)).toBe(false);
  });
});
