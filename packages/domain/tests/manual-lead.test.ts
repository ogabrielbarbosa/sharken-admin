import { describe, expect, it } from 'vitest';
import { checkEliminatory, DEFAULT_CRITERIA, manualLead } from '../src';

const batch = { id: 'b1', business_type: 'Advocacia' };

describe('lead manual', () => {
  it('normaliza os dados', () => {
    expect(manualLead({ name: ' Silva Advogados ', phone: '(12) 99999-0001', instagram: '@Silva.Adv', website: 'silva.adv.br' }, batch)).toMatchObject({
      lead: { name: 'Silva Advogados', business_type: 'Advocacia', phone_e164: '5512999990001', instagram_url: 'https://www.instagram.com/silva.adv/', website_url: 'https://silva.adv.br/', place_id: null },
    });
  });
  it('aceita só o nome e telefone fixo', () => {
    expect(manualLead({ name: 'X', phone: '(12) 3921-0000' }, batch)).toMatchObject({ lead: { phone_raw: '(12) 3921-0000', phone_e164: null } });
  });
  it('recusa o que não é válido', () => {
    for (const bad of [{ name: ' ' }, { name: 'X', phone: '999' }, { name: 'X', email: 'a' }, { name: 'X', website: 'meu site' }, { name: 'X', instagram: 'https://instagram.com/p/abc' }, { name: 'X', instagram: 'instagram.com' }]) {
      expect(manualLead(bad, batch)).toHaveProperty('error');
    }
  });
  it('só é descartado por não contatar', () => {
    const lead = { phone_e164: null, email: null, franchise: true };
    const ctx = { blocked: false, lastContactAt: new Date(), now: new Date() };
    expect(checkEliminatory(lead, ctx, DEFAULT_CRITERIA, true).passed).toBe(true);
    expect(checkEliminatory(lead, { ...ctx, blocked: true }, DEFAULT_CRITERIA, true).reasons).toEqual(['Está em não contatar']);
    expect(checkEliminatory(lead, ctx, DEFAULT_CRITERIA).passed).toBe(false);
  });
});
