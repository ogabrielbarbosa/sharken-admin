import { describe, expect, it, vi } from 'vitest';
import { enrichLead, RateLimited, type EnrichDeps } from '../src/enrichment';

const vcard = (fn: string, email?: string) => ['vcard', [['fn', {}, 'text', fn], ...(email ? [['email', {}, 'text', email]] : [])]];
const rdap = { entities: [{ roles: ['registrant'], vcardArray: vcard('Clínica X'), publicIds: [{ type: 'cnpj', identifier: '43.047.454/0001-20' }], entities: [{ roles: ['administrative'], vcardArray: vcard('Dona', 'dona@gmail.com') }] }] };
const brasil = { cnpj: '43047454000120', razao_social: 'CLINICA X LTDA', ddd_telefone_1: '12991234567', qsa: [{ nome_socio: 'DONA', qualificacao_socio: 'Sócia' }] };
const deps = (over: Partial<EnrichDeps> = {}): EnrichDeps => ({
  rdap: vi.fn(async () => rdap), brasilApi: vi.fn(async () => brasil), cnpjWs: vi.fn(async () => ({ estabelecimento: { email: 'contador@x.com' } })),
  now: () => new Date('2026-11-12T00:00:00Z'), ...over,
});
const site = { title: null, description: null, headings: [], text: 'contato@clinicax.com.br', images: [], themeColor: null, logo: null, whatsappLinks: ['https://wa.me/5512988887777'] };

describe('enrichLead', () => {
  it('junta site, WHOIS e CNPJ com a fonte de cada dado', async () => {
    const out = await enrichLead({ website_url: 'https://www.clinicax.com.br', site_data: site }, deps());
    expect(out.domain).toBe('clinicax.com.br');
    expect(out.company?.legal_name).toBe('Clinica X Ltda');
    expect(out.emails.map((e) => [e.email, e.source])).toEqual([['contato@clinicax.com.br', 'site'], ['dona@gmail.com', 'whois'], ['contador@x.com', 'cnpj']]);
    expect(out.phones).toEqual([{ e164: '5512988887777', source: 'site', mobile: true }, { e164: '5512991234567', source: 'cnpj', mobile: true }]);
    expect(out.people.map((p) => p.name)).toEqual(['Clínica X', 'Dona']);
  });
  it('não consulta WHOIS fora do .br', async () => {
    const d = deps();
    const out = await enrichLead({ website_url: 'https://clinica.com', site_data: null }, d);
    expect(d.rdap).not.toHaveBeenCalled();
    expect(out.notes[0]).toMatch(/não é \.br/);
  });
  it('falha de uma fonte vira nota', async () => {
    const out = await enrichLead({ website_url: 'clinicax.com.br', site_data: null }, deps({ brasilApi: vi.fn(async () => { throw new Error('caiu'); }) }));
    expect(out.notes.some((n) => n.includes('caiu'))).toBe(true);
    expect(out.emails.map((e) => e.email)).toContain('contador@x.com');
  });
  it('repassa o limite do CNPJ.ws', async () => {
    await expect(enrichLead({ website_url: 'clinicax.com.br', site_data: null }, deps({ cnpjWs: vi.fn(async () => { throw new RateLimited('CNPJ.ws'); }) }))).rejects.toBeInstanceOf(RateLimited);
  });
});
