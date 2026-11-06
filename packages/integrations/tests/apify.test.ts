import { describe, expect, it } from 'vitest';
import { buildInstagramInput, buildMapsInput, buildRunUrl, parseWebhookEvent, usernameFromUrl } from '../src/apify';

describe('buildMapsInput', () => {
  it('monta exatamente a entrada do ator', () => {
    expect(buildMapsInput({ location: 'Campinas, SP', businessType: 'pet shop', quantity: 50 })).toEqual({
      searchStringsArray: ['pet shop'], locationQuery: 'Campinas, SP, Brasil', maxCrawledPlacesPerSearch: 50,
      language: 'pt-BR', website: 'allPlaces', maxImages: 8, maxReviews: 5, reviewsSort: 'highestRanking',
      reviewsOrigin: 'google', scrapeReviewsPersonalData: false,
    });
  });
});

describe('buildRunUrl', () => {
  it('registra o webhook nos quatro eventos finais', () => {
    const url = new URL(buildRunUrl('compass/crawler-google-places', 'tok', 'https://app.test/hook?secret=s'));
    expect(url.pathname).toBe('/v2/acts/compass~crawler-google-places/runs');
    expect(url.searchParams.get('token')).toBe('tok');
    const hooks = JSON.parse(Buffer.from(url.searchParams.get('webhooks')!, 'base64').toString());
    expect(hooks[0].requestUrl).toBe('https://app.test/hook?secret=s');
    expect(hooks[0].eventTypes).toEqual(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED']);
  });
});

describe('Instagram', () => {
  it('extrai o usuário da URL', () => {
    expect(usernameFromUrl('https://www.instagram.com/petlegal/?hl=pt')).toBe('petlegal');
    expect(usernameFromUrl('https://instagram.com/p/abc')).toBeNull();
  });
  it('remove usuários repetidos e inválidos', () => {
    expect(buildInstagramInput(['https://instagram.com/a', 'https://instagram.com/a/', 'https://instagram.com/p/x'])).toEqual({ usernames: ['a'] });
  });
});

describe('parseWebhookEvent', () => {
  it('lê evento e dataset', () => {
    expect(parseWebhookEvent({ eventType: 'ACTOR.RUN.FAILED', resource: { defaultDatasetId: 'd1', id: 'r1' } })).toEqual({
      succeeded: false, datasetId: 'd1', runId: 'r1',
    });
  });
});
