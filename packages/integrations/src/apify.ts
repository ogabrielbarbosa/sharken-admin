import type { ApifyPlace } from '@lps/domain';

const BASE = 'https://api.apify.com/v2';
export const MAPS_ACTOR = 'compass/crawler-google-places';
export const INSTAGRAM_ACTOR = 'apify/instagram-profile-scraper';
const FINAL_EVENTS = ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'];

export function buildMapsInput(b: { location: string; businessType: string; quantity: number }) {
  return {
    searchStringsArray: [b.businessType],
    locationQuery: `${b.location}, Brasil`,
    maxCrawledPlacesPerSearch: b.quantity,
    language: 'pt-BR',
    website: 'allPlaces',
    maxImages: 8,
    maxReviews: 5,
    reviewsSort: 'highestRanking',
    reviewsOrigin: 'google',
    scrapeReviewsPersonalData: false,
  };
}

export function usernameFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    return parts[0].toLowerCase();
  } catch {
    return null;
  }
}

export function buildInstagramInput(urls: string[]) {
  const names = urls.map(usernameFromUrl).filter((u): u is string => !!u);
  return { usernames: [...new Set(names)] };
}

export function buildRunUrl(actor: string, token: string, webhookUrl: string): string {
  const hooks = [{ eventTypes: FINAL_EVENTS, requestUrl: webhookUrl }];
  const url = new URL(`${BASE}/acts/${actor.replace('/', '~')}/runs`);
  url.searchParams.set('token', token);
  url.searchParams.set('webhooks', Buffer.from(JSON.stringify(hooks)).toString('base64'));
  return url.toString();
}

export function parseWebhookEvent(body: { eventType?: string; resource?: { defaultDatasetId?: string; id?: string } }) {
  return {
    succeeded: body.eventType === 'ACTOR.RUN.SUCCEEDED',
    datasetId: body.resource?.defaultDatasetId ?? null,
    runId: body.resource?.id ?? null,
  };
}

function token(): string {
  const value = process.env.APIFY_TOKEN;
  if (!value) throw new Error('Configure a variável APIFY_TOKEN.');
  return value;
}

export async function startActorRun(actor: string, input: object, webhookUrl: string): Promise<string> {
  const res = await fetch(buildRunUrl(actor, token(), webhookUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`O Apify recusou a busca (${res.status}).`);
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

export async function fetchDataset<T = ApifyPlace>(datasetId: string): Promise<T[]> {
  const res = await fetch(`${BASE}/datasets/${datasetId}/items?clean=true&token=${token()}`);
  if (!res.ok) throw new Error(`Não foi possível ler os resultados do Apify (${res.status}).`);
  return (await res.json()) as T[];
}

export type InstagramProfile = { username?: string; latestPosts?: { timestamp?: string }[] };

export function latestPostDate(profile: InstagramProfile): string | null {
  const dates = (profile.latestPosts ?? []).map((p) => p.timestamp).filter((t): t is string => !!t).sort();
  return dates.at(-1) ?? null;
}

/** Sem um endereço público, o webhook do Apify não chega: o worker consulta o resultado. */
export function shouldPollRuns(env: { APP_URL: string; WEBHOOK_BASE_URL?: string }): boolean {
  if (env.WEBHOOK_BASE_URL) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.APP_URL);
}

export function runOutcome(status: string): 'pending' | 'succeeded' | 'failed' {
  if (status === 'SUCCEEDED') return 'succeeded';
  if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(status)) return 'failed';
  return 'pending';
}

export async function getRun(runId: string): Promise<{ status: string; defaultDatasetId: string | null }> {
  const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token()}`);
  if (!res.ok) throw new Error(`Não foi possível consultar a busca no Apify (${res.status}).`);
  const { data } = (await res.json()) as { data: { status: string; defaultDatasetId?: string } };
  return { status: data.status, defaultDatasetId: data.defaultDatasetId ?? null };
}
