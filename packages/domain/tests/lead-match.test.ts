import { describe, expect, it } from 'vitest';
import { findMatch, keysOf, mergeIncoming, nameCore, possibleDuplicates, sharedPhonesOf, textSimilarity, type LeadKeys } from '../src/lead-match';
import type { NewLead } from '../src/apify-mapper';
import type { Lead } from '../src/types';

const k = (o: Partial<LeadKeys> & { id: string }) => ({ place_id: null, instagram_handle: null, site_domain: null, phone_e164: null, ...o });

describe('findMatch', () => {
  const existing = [
    k({ id: 'maps', place_id: 'P1', phone_e164: '5512999990000' }),
    k({ id: 'insta', instagram_handle: 'clinica.sorriso', site_domain: 'sorriso.com.br' }),
    k({ id: 'franq1', phone_e164: '5511900000000', place_id: 'F1' }),
    k({ id: 'franq2', phone_e164: '5511900000000', place_id: 'F2' }),
  ];
  const shared = sharedPhonesOf(existing);

  it('acha pelo place_id, pelo @, pelo domínio e pelo telefone', () => {
    expect(findMatch(keysOf({ place_id: 'P1' }), existing)?.id).toBe('maps');
    expect(findMatch(keysOf({ instagram_url: 'https://instagram.com/Clinica.Sorriso/' }), existing)?.id).toBe('insta');
    expect(findMatch(keysOf({ website_url: 'https://www.sorriso.com.br/contato' }), existing)?.id).toBe('insta');
    expect(findMatch(keysOf({ phone_e164: '5512999990000' }), existing, shared)?.id).toBe('maps');
  });

  it('ignora telefone repetido em vários leads', () => {
    expect(findMatch(keysOf({ phone_e164: '5511900000000' }), existing, shared)).toBeNull();
  });

  it('não junta dois lugares diferentes do Maps nem dois perfis diferentes', () => {
    expect(findMatch(keysOf({ place_id: 'P9', phone_e164: '5512999990000' }), existing, shared)).toBeNull();
    expect(findMatch(keysOf({ instagram_url: 'instagram.com/outra', website_url: 'sorriso.com.br' }), existing)).toBeNull();
  });
});

describe('mergeIncoming', () => {
  const lead = {
    id: '1', place_id: null, name: 'Clínica', phone_raw: null, phone_e164: '5512999990000', address: null, city: 'SJC',
    website_url: null, instagram_url: 'https://instagram.com/clinica/', email: null, business_type: 'Dentista',
    description: 'bio', categories: [], instagram_last_post_at: '2026-11-01T00:00:00Z', rating: null, reviews_count: 0,
    images_count: 0, is_open: true, photos: [], reviews: [], stage: 'pagina',
  } as unknown as Lead;
  const fromMaps = {
    batch_id: 'b', place_id: 'P1', name: 'Clínica Sorriso', business_type: 'Dentista', phone_raw: '(12) 3333-0000', phone_e164: null,
    address: 'Rua A, 1', city: 'São José dos Campos', is_open: true, rating: 4.9, reviews_count: 80, images_count: 12,
    description: null, categories: ['Dentista'], photos: ['f.jpg'], reviews: [], website_url: 'https://sorriso.com.br',
  } as NewLead;

  it('preenche o que falta, traz os números do Maps e não mexe na etapa', () => {
    const patch = mergeIncoming(lead, fromMaps);
    expect(patch).toMatchObject({ place_id: 'P1', address: 'Rua A, 1', website_url: 'https://sorriso.com.br', rating: 4.9, reviews_count: 80, categories: ['Dentista'] });
    expect(patch).not.toHaveProperty('city');
    expect(patch).not.toHaveProperty('phone_e164');
    expect(patch).not.toHaveProperty('stage');
  });

  it('fica com o post mais recente', () => {
    expect(mergeIncoming(lead, { ...fromMaps, place_id: null, instagram_last_post_at: '2026-11-20T00:00:00Z' }).instagram_last_post_at).toBe('2026-11-20T00:00:00Z');
    expect(mergeIncoming(lead, { ...fromMaps, place_id: null, instagram_last_post_at: '2026-10-01T00:00:00Z' })).not.toHaveProperty('instagram_last_post_at');
  });
});

describe('nome parecido', () => {
  it('tira as palavras genéricas', () => {
    expect(nameCore('Clínica Odontológica Sorriso Lindo')).toBe('sorriso lindo');
  });

  it('acha o par na mesma cidade e ignora quem tem chaves diferentes', () => {
    const leads = [
      { ...k({ id: 'a', place_id: 'P1' }), name: 'Clínica Sorriso Lindo', city: 'São José dos Campos' },
      { ...k({ id: 'b', instagram_handle: 'sorrisolindo' }), name: 'Sorriso Lindo Odontologia', city: 'Sao Jose dos Campos' },
      { ...k({ id: 'c', place_id: 'P2' }), name: 'Sorriso Lindo', city: 'São José dos Campos' },
      { ...k({ id: 'd' }), name: 'Sorriso Lindo', city: 'Jacareí' },
      { ...k({ id: 'e' }), name: 'Dente de Ouro', city: 'São José dos Campos' },
    ];
    const pairs = possibleDuplicates(leads).map((p) => [p.a.id, p.b.id].sort().join(''));
    expect(pairs.sort()).toEqual(['ab', 'bc']);
    expect(textSimilarity('Sorriso Lindo', 'Dente de Ouro')).toBeLessThan(0.2);
  });
});
