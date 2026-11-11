import { describe, expect, it } from 'vitest';
import { buildContractPayload, requireTemplateId, zapsignProvider } from '../src/contracts/zapsign';
import * as legacy from '../src/zapsign';

const client = { legal_name: 'Pet Shop Focinho Feliz', document: '11222333000181', contact_name: 'Carla Mendes', email: null, phone: '5519981342207', address: 'R. Dr. Heitor Penteado, 1180' };
const service = { name: 'Site para Pet Shop', kind: 'recorrente' as const, amount_cents: 120000, start_date: '2026-11-18', notes: 'Inclui domínio', payment_method: 'cartao' as const, first_due_date: '2026-11-20', cycle: 'trimestral' };
const vars = (body: ReturnType<typeof buildContractPayload>) => Object.fromEntries((body.data as { de: string; para: string }[]).map((d) => [d.de, d.para]));

describe('variáveis do modelo ZapSign', () => {
  const data = vars(buildContractPayload(client, service, 'tpl', 'ctr1', new Date('2026-11-11T15:00:00Z')));
  it('manda exatamente as 14 variáveis da spec', () => {
    expect(Object.keys(data).sort()).toEqual([
      '{{DATA_INICIO}}', '{{DATA}}', '{{DESCRICAO}}', '{{DOCUMENTO}}', '{{EMAIL}}', '{{ENDERECO}}', '{{FORMA_PAGAMENTO}}',
      '{{NOME}}', '{{PERIODICIDADE}}', '{{RESPONSAVEL}}', '{{SERVICO}}', '{{TELEFONE}}', '{{VALOR}}', '{{VENCIMENTO}}',
    ].sort());
  });
  it('formata documento, telefone, datas e valor', () => {
    expect(data['{{DOCUMENTO}}']).toBe('11.222.333/0001-81');
    expect(data['{{TELEFONE}}']).toBe('(19) 98134-2207');
    expect(data['{{VALOR}}'].replace(/\s/g, ' ')).toBe('R$ 1.200,00');
    expect(data['{{DATA_INICIO}}']).toBe('18/11/2026');
    expect(data['{{VENCIMENTO}}']).toBe('20/11/2026');
    expect(data['{{DATA}}']).toBe('11 de novembro de 2026');
  });
  it('traduz forma e periodicidade; único vira pagamento único', () => {
    expect(data['{{FORMA_PAGAMENTO}}']).toBe('Cartão');
    expect(data['{{PERIODICIDADE}}']).toBe('Trimestral');
    const unico = vars(buildContractPayload(client, { ...service, kind: 'unico', cycle: null, payment_method: 'pix' }, 'tpl', 'c'));
    expect(unico['{{PERIODICIDADE}}']).toBe('pagamento único');
    expect(unico['{{FORMA_PAGAMENTO}}']).toBe('Pix');
  });
  it('campos vazios saem em branco, e quem assina é o responsável', () => {
    expect(data['{{EMAIL}}']).toBe('');
    expect(data['{{RESPONSAVEL}}']).toBe('Carla Mendes');
    expect(data['{{DESCRICAO}}']).toBe('Inclui domínio');
    expect(buildContractPayload(client, service, 'tpl', 'c')).toMatchObject({ signer_name: 'Carla Mendes', disable_signer_emails: true, external_id: 'c' });
  });
  it('sem modelo configurado, avisa', () => {
    expect(() => requireTemplateId({})).toThrow(/modelo/i);
    expect(legacy.requireTemplateId).toBe(requireTemplateId);
  });
});

describe('normalizeWebhook', () => {
  const n = zapsignProvider.normalizeWebhook;
  it('traduz assinado, recusado e os demais eventos', () => {
    expect(n({ token: 'd', event_type: 'doc_signed', status: 'signed' })).toEqual({ docToken: 'd', status: 'assinado' });
    expect(n({ token: 'd', event_type: 'doc_refused', status: 'refused' })).toEqual({ docToken: 'd', status: 'recusado' });
    expect(n({ token: 'd', event_type: 'doc_created', status: 'pending' })).toEqual({ docToken: 'd', status: 'enviado' });
  });
  it('ignora corpo sem token', () => {
    expect(n({})).toBeNull();
    expect(n(null)).toBeNull();
  });
});
