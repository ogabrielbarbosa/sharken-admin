import { findMunicipio, type ApifyPlace } from '@lps/domain';

const BASE = 'https://api.apify.com/v2';
export const MAPS_ACTOR = 'compass/crawler-google-places';
export const INSTAGRAM_ACTOR = 'apify/instagram-profile-scraper';
const FINAL_EVENTS = ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'];

export function buildMapsInput(b: { location: string; businessType: string; quantity: number }) {
  // Batches novos guardam "Cidade, UF". O nome do estado por extenso evita que o Apify ache a cidade errada.
  const m = findMunicipio(b.location);
  return {
    searchStringsArray: [b.businessType],
    locationQuery: m ? `${m.nome}, ${m.estado}, Brasil` : `${b.location}, Brasil`,
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

/** Sem `webhookUrl` (ambiente local), o Apify não avisa e o worker consulta o resultado. */
export function buildRunUrl(actor: string, token: string, webhookUrl: string | null): string {
  const url = new URL(`${BASE}/acts/${actor.replace('/', '~')}/runs`);
  url.searchParams.set('token', token);
  if (webhookUrl) {
    const hooks = [{ eventTypes: FINAL_EVENTS, requestUrl: webhookUrl }];
    url.searchParams.set('webhooks', Buffer.from(JSON.stringify(hooks)).toString('base64'));
  }
  return url.toString();
}

export function parseWebhookEvent(body: { eventType?: string; resource?: { defaultDatasetId?: string; id?: string } }) {
  return {
    succeeded: body.eventType === 'ACTOR.RUN.SUCCEEDED',
    datasetId: body.resource?.defaultDatasetId ?? null,
    runId: body.resource?.id ?? null,
  };
}

export const APIFY_NOT_CONNECTED = 'Conecte sua conta do Apify em Configurações › Apify.';
export const APIFY_OUT_OF_CREDIT = 'Acabou o crédito do Apify deste mês. Veja em console.apify.com › Billing.';

/** O workspace ainda não colou o token do Apify em Configurações. */
export class ApifyNotConnected extends Error {
  constructor() {
    super(APIFY_NOT_CONNECTED);
  }
}

type ApifyErrorBody = { error?: { type?: string; message?: string } } | null;

/** Falta de crédito vira uma mensagem clara; o resto mantém "<prefixo> (status): detalhe". */
export function apifyErrorMessage(status: number, body: ApifyErrorBody, fallback: string): string {
  const type = body?.error?.type ?? '';
  const detail = body?.error?.message;
  // 429 (rate-limit-exceeded) é excesso de requisições, não falta de crédito.
  if (status !== 429 && (status === 402 || /usage|credit|payment/i.test(type) || /monthly usage|not enough|credit/i.test(detail ?? ''))) return APIFY_OUT_OF_CREDIT;
  return `${fallback} (${status})${detail ? `: ${detail}` : '.'}`;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  return new Error(apifyErrorMessage(res.status, (await res.json().catch(() => null)) as ApifyErrorBody, fallback));
}

/** Confere o token e diz de quem é a conta (usado ao conectar em Configurações). */
export async function apifyAccount(token: string, fetcher: typeof fetch = fetch): Promise<{ username: string; plan: string }> {
  const res = await fetcher(`${BASE}/users/me`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new Error('O Apify recusou esse token.');
  if (!res.ok) throw await failure(res, 'Não foi possível consultar a conta do Apify');
  const { data } = (await res.json()) as { data: { username: string; plan?: { id?: string } } };
  return { username: data.username, plan: data.plan?.id ?? 'desconhecido' };
}

export async function startActorRun(token: string, actor: string, input: object, webhookUrl: string | null): Promise<string> {
  const res = await fetch(buildRunUrl(actor, token, webhookUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await failure(res, 'O Apify recusou a busca');
  const json = (await res.json()) as { data: { id: string } };
  return json.data.id;
}

export async function fetchDataset<T = ApifyPlace>(token: string, datasetId: string): Promise<T[]> {
  const res = await fetch(`${BASE}/datasets/${datasetId}/items?clean=true&token=${token}`);
  if (!res.ok) throw await failure(res, 'Não foi possível ler os resultados do Apify');
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

export async function getRun(token: string, runId: string): Promise<{ status: string; defaultDatasetId: string | null }> {
  const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token}`);
  if (!res.ok) throw await failure(res, 'Não foi possível consultar a busca no Apify');
  const { data } = (await res.json()) as { data: { status: string; defaultDatasetId?: string } };
  return { status: data.status, defaultDatasetId: data.defaultDatasetId ?? null };
}

/** Roda o ator e espera o resultado na mesma chamada (usado na extração de um link do Instagram). */
export async function runActorSync<T>(token: string, actor: string, input: object, timeoutMs = 120_000): Promise<T[]> {
  const url = new URL(`${BASE}/acts/${actor.replace('/', '~')}/run-sync-get-dataset-items`);
  url.searchParams.set('clean', 'true');
  url.searchParams.set('timeout', String(Math.ceil(timeoutMs / 1000)));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw await failure(res, 'O Apify recusou a leitura');
  return (await res.json()) as T[];
}
