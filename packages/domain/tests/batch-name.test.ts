import { describe, expect, it } from 'vitest';
import { batchName, batchSource, batchSourceDetail } from '../src';

describe('nome e fonte do batch', () => {
  it('usa o nome escolhido ou monta um', () => {
    expect(batchName({ name: ' Teste ', location: 'Campinas, SP', business_type: 'dentista' })).toBe('Teste');
    expect(batchName({ name: null, location: 'Campinas, SP', business_type: 'dentista' })).toBe('dentista · Campinas, SP');
    expect(batchName({ location: '@sharken', business_type: 'Perfis do Instagram' })).toBe('@sharken');
    expect(batchName({ location: 'Leads sem batch', business_type: '' })).toBe('Leads sem batch');
  });
  it('detalha a fonte', () => {
    expect(batchSourceDetail({ source: 'instagram_profile', location: '@a', locations: [], source_profile: 'a', source_relations: ['following', 'followers'] })).toBe('@a · Seguindo e Seguidores');
    expect(batchSourceDetail({ source: 'maps', location: 'A + B + C', locations: ['A', 'B', 'C'] })).toBe('A e mais 2 cidades');
    expect(batchSourceDetail({ source: 'maps', location: 'A', locations: [] })).toBe('A');
    expect(batchSource({ source: 'instagram', location: 'Leads manuais' })).toBe('manual');
  });
});
