import { describe, expect, it } from 'vitest';
import { buildInstagramQueries, GOOGLE_WORD_LIMIT, handlesFromSearch, searchPagesFor } from '../src/instagram-search';
import { mapProfileToLead, phoneFromProfile } from '../src/instagram-profile';
import { checkEliminatory } from '../src/icp';
import { DEFAULT_CRITERIA } from '../src/criteria';

describe('buildInstagramQueries', () => {
  it('monta a busca como o Gabriel faz à mão', () => {
    expect(buildInstagramQueries(['lentes de contato dental', 'lentes dentais', 'facetas'], ['são josé dos campos', 'sjc'])).toEqual([
      'site:instagram.com ("lentes de contato dental" OR "lentes dentais" OR "facetas") ("são josé dos campos" OR "sjc") -inurl:/p/ -inurl:/reel/ -inurl:/reels/ -inurl:/explore/ -inurl:/tv/ -inurl:/stories/',
    ]);
  });

  it('divide quando passa de 32 palavras e não repete termos', () => {
    const niches = Array.from({ length: 12 }, (_, i) => `termo numero ${i}`);
    const queries = buildInstagramQueries([...niches, 'TERMO NUMERO 0'], ['sjc']);
    expect(queries.length).toBeGreaterThan(1);
    for (const q of queries) expect(q.split(' ').length).toBeLessThanOrEqual(GOOGLE_WORD_LIMIT);
    expect(queries.join(' ').match(/termo numero 0"/gi)).toHaveLength(1);
  });

  it('sem nicho não busca', () => {
    expect(buildInstagramQueries([], ['sjc'])).toEqual([]);
  });

  it('páginas por consulta', () => {
    expect(searchPagesFor(50, 1)).toBe(5);
    expect(searchPagesFor(50, 3)).toBe(2);
    expect(searchPagesFor(500, 1)).toBe(10);
  });
});

describe('handlesFromSearch', () => {
  it('só perfis, sem repetir', () => {
    expect(handlesFromSearch([{ organicResults: [
      { url: 'https://www.instagram.com/clinica.sorriso/' }, { url: 'https://www.instagram.com/p/C1/' },
      { url: 'https://www.instagram.com/Clinica.Sorriso/reel/C2/' }, { url: 'https://site.com.br' }, { url: 'https://www.instagram.com/dra.ana/?hl=pt' },
    ] }])).toEqual(['clinica.sorriso', 'dra.ana']);
  });
});

describe('mapProfileToLead', () => {
  it('tira telefone, e-mail e site da bio e dos links', () => {
    const lead = mapProfileToLead({
      username: 'Clinica.Sorriso', fullName: 'Clínica Sorriso | Lentes', biography: 'Lentes e facetas 🦷\nAgende: (12) 99876-5432\ncontato@sorriso.com.br',
      externalUrls: [{ url: 'https://wa.me/5512911112222' }, { url: 'https://sorriso.com.br' }], latestPosts: [{ timestamp: '2026-11-01T10:00:00Z' }, { timestamp: '2026-11-20T10:00:00Z' }],
    }, 'b1', { city: 'São José dos Campos', businessType: 'lentes dentais' })!;
    expect(lead).toMatchObject({
      place_id: null, name: 'Clínica Sorriso | Lentes', phone_e164: '5512911112222', email: 'contato@sorriso.com.br',
      website_url: 'https://sorriso.com.br', instagram_url: 'https://www.instagram.com/clinica.sorriso/',
      instagram_last_post_at: '2026-11-20T10:00:00Z', city: 'São José dos Campos', business_type: 'lentes dentais',
    });
  });

  it('telefone fixo não vira celular', () => {
    expect(phoneFromProfile({ biography: 'Tel (12) 3333-4444' }).e164).toBeNull();
  });

  it('sem usuário não vira lead', () => {
    expect(mapProfileToLead({}, 'b', { city: null, businessType: 'x' })).toBeNull();
  });
});

describe('critérios marcados no batch', () => {
  const now = new Date('2026-11-22T00:00:00Z');
  const ctx = { blocked: false, lastContactAt: null, now };
  const base = { phone_e164: '5512999990000', email: null, franchise: false, instagram_last_post_at: '2026-11-10T00:00:00Z', site_status: 'sem_link' as const };

  it('batch antigo, sem marcações, não exige nada novo', () => {
    expect(checkEliminatory({ ...base, instagram_last_post_at: null, site_status: 'funcionando' }, ctx, DEFAULT_CRITERIA).passed).toBe(true);
  });

  it('descarta quem não atende', () => {
    const c = { ...DEFAULT_CRITERIA, requireInstagramActive: true, requirePhone: true, site: 'sem_site' as const };
    expect(checkEliminatory(base, ctx, c).passed).toBe(true);
    expect(checkEliminatory({ ...base, instagram_last_post_at: '2026-01-01T00:00:00Z' }, ctx, c).reasons).toEqual(['Sem post no Instagram nos últimos 90 dias']);
    expect(checkEliminatory({ ...base, phone_e164: null, email: 'a@b.com' }, ctx, c).reasons).toEqual(['Sem celular']);
    expect(checkEliminatory({ ...base, site_status: 'funcionando' }, ctx, c).reasons).toEqual(['Tem site']);
    expect(checkEliminatory({ ...base, site_status: 'sem_link' }, ctx, { ...c, site: 'com_site' }).reasons).toEqual(['Sem site funcionando']);
  });
});
