import { describe, expect, it, vi } from 'vitest';
import { APIFY_OUT_OF_CREDIT, apifyAccount, apifyErrorMessage, buildGoogleInput, buildInstagramInput, buildMapsInput, buildRunUrl, parseWebhookEvent, runOutcome, shouldPollRuns, usernameFromUrl } from '../src/apify';

describe('buildMapsInput', () => {
  it('monta exatamente a entrada do ator', () => {
    expect(buildMapsInput({ location: 'Campinas, SP', businessType: 'pet shop', quantity: 50 })).toEqual({
      searchStringsArray: ['pet shop'], locationQuery: 'Campinas, São Paulo, Brasil', maxCrawledPlacesPerSearch: 50,
      language: 'pt-BR', website: 'allPlaces', maxImages: 8, maxReviews: 5, reviewsSort: 'highestRanking',
      reviewsOrigin: 'google', scrapeReviewsPersonalData: false,
    });
  });
  it('mantém o texto livre dos batches antigos', () => {
    expect(buildMapsInput({ location: 'Zona Sul, Rio', businessType: 'x', quantity: 1 })).toMatchObject({ locationQuery: 'Zona Sul, Rio, Brasil' });
  });
  it('várias cidades: uma busca por cidade, dividindo a quantidade', () => {
    expect(buildMapsInput({ locations: ['São José dos Campos, SP', 'Jacareí, SP'], businessType: 'dentista', quantity: 50 })).toMatchObject({
      searchStringsArray: ['dentista em São José dos Campos, São Paulo, Brasil', 'dentista em Jacareí, São Paulo, Brasil'],
      maxCrawledPlacesPerSearch: 25,
    });
  });
});

describe('buildGoogleInput', () => {
  it('uma consulta por linha', () => {
    expect(buildGoogleInput(['a', 'b'], 3)).toMatchObject({ queries: 'a\nb', maxPagesPerQuery: 3, countryCode: 'br' });
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

describe('buildRunUrl sem webhook', () => {
  it('não registra webhook no ambiente local', () => {
    const url = new URL(buildRunUrl('compass/crawler-google-places', 'tok', null));
    expect(url.searchParams.has('webhooks')).toBe(false);
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

describe('consulta do resultado sem webhook', () => {
  it('só consulta em ambiente local sem túnel', () => {
    expect(shouldPollRuns({ APP_URL: 'http://localhost:3010' })).toBe(true);
    expect(shouldPollRuns({ APP_URL: 'http://127.0.0.1:3010' })).toBe(true);
    expect(shouldPollRuns({ APP_URL: 'http://localhost:3010', WEBHOOK_BASE_URL: 'https://t.dev' })).toBe(false);
    expect(shouldPollRuns({ APP_URL: 'https://painel.app' })).toBe(false);
  });
  it('lê o status da execução', () => {
    expect(runOutcome('RUNNING')).toBe('pending');
    expect(runOutcome('READY')).toBe('pending');
    expect(runOutcome('SUCCEEDED')).toBe('succeeded');
    expect(runOutcome('FAILED')).toBe('failed');
    expect(runOutcome('TIMED-OUT')).toBe('failed');
    expect(runOutcome('ABORTED')).toBe('failed');
  });
});

describe('apifyErrorMessage', () => {
  it('402 é crédito esgotado', () => {
    expect(apifyErrorMessage(402, null, 'O Apify recusou a busca')).toBe(APIFY_OUT_OF_CREDIT);
  });
  it('tipo de erro de uso é crédito esgotado', () => {
    expect(apifyErrorMessage(403, { error: { type: 'not-enough-usage-to-run-paid-actor', message: 'x' } }, 'O Apify recusou a busca')).toBe(APIFY_OUT_OF_CREDIT);
  });
  it('limite de requisições (429) não é crédito esgotado', () => {
    expect(apifyErrorMessage(429, { error: { type: 'rate-limit-exceeded', message: 'Too many requests' } }, 'O Apify recusou a leitura')).toBe('O Apify recusou a leitura (429): Too many requests');
  });
  it('outros erros mantêm o formato', () => {
    expect(apifyErrorMessage(400, { error: { type: 'invalid-input', message: 'campo errado' } }, 'O Apify recusou a busca')).toBe('O Apify recusou a busca (400): campo errado');
    expect(apifyErrorMessage(500, null, 'O Apify recusou a busca')).toBe('O Apify recusou a busca (500).');
  });
});

describe('apifyAccount', () => {
  it('devolve usuário e plano usando o token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { username: 'ana', plan: { id: 'FREE' } } })));
    expect(await apifyAccount('tok', fetcher as unknown as typeof fetch)).toEqual({ username: 'ana', plan: 'FREE' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.apify.com/v2/users/me');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
  it('token recusado', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(apifyAccount('ruim', fetcher as unknown as typeof fetch)).rejects.toThrow('O Apify recusou esse token.');
  });
});
