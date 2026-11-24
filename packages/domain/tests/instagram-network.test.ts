import { describe, expect, it } from 'vitest';
import { batchCountry, checkEliminatory, DEFAULT_CRITERIA, handlesFromNetwork, profileHandle } from '../src';

describe('perfil do Instagram como fonte', () => {
  it('lê o @ do link ou do nome', () => {
    expect(profileHandle('https://www.instagram.com/Sharken.Contractors/?hl=pt')).toBe('sharken.contractors');
    expect(profileHandle(' @sharken.contractors ')).toBe('sharken.contractors');
    expect(profileHandle('https://www.instagram.com/p/abc/')).toBeNull();
    expect(profileHandle('https://sharken.com')).toBeNull();
    expect(profileHandle('')).toBeNull();
  });
  it('junta as listas sem repetir e sem o próprio perfil', () => {
    expect(handlesFromNetwork([{ username: 'A' }, { username: 'a' }, {}, { username: 'eu' }, { username: 'b' }], 'Eu')).toEqual(['a', 'b']);
  });
  it('país escolhido vale antes do das cidades', () => {
    expect(batchCountry({ country: 'US', places: [] })).toBe('US');
    expect(batchCountry({})).toBe('BR');
  });
  it('sem contato só descarta quando o batch exige', () => {
    const lead = { phone_e164: null, email: null, franchise: false };
    const ctx = { blocked: false, lastContactAt: null, now: new Date() };
    expect(checkEliminatory(lead, ctx, DEFAULT_CRITERIA).passed).toBe(false);
    expect(checkEliminatory(lead, ctx, { ...DEFAULT_CRITERIA, allowNoContact: true }).passed).toBe(true);
  });
});
