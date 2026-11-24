import { countryLanguage, countryNameEn, findMunicipio, type ApifyPlace } from '@lps/domain';

const BASE = 'https://api.apify.com/v2';
export const MAPS_ACTOR = 'compass/crawler-google-places';
export const INSTAGRAM_ACTOR = 'apify/instagram-profile-scraper';
const FINAL_EVENTS = ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'];

/** Seguidores ou seguindo de um perfil público: só os nomes, uma lista por execução. No plano gratuito do Apify traz só a primeira página. */
export const NETWORK_ACTOR = 'apify/instagram-followers-following-scraper';
export const GOOGLE_ACTOR = 'apify/google-search-scraper';
/** Atores que o Sharken usa; os outros da conta são de outros projetos. */
export const SHARKEN_ACTORS = [MAPS_ACTOR, INSTAGRAM_ACTOR, GOOGLE_ACTOR, NETWORK_ACTOR] as const;

/** Fora do Brasil: "Cidade, Região, País" com o país em inglês. No Brasil, "Cidade, UF" → "Cidade, Estado, Brasil": o nome do estado por extenso evita que o Apify ache a cidade errada. */
const mapsPlace = (location: string, country: string) => {
  if (country !== 'BR') return [...location.split(', ').slice(0, -1), countryNameEn(country)].join(', ');
  const m = findMunicipio(location);
  return m ? `${m.nome}, ${m.estado}, Brasil` : `${location}, Brasil`;
};

export function buildMapsInput(b: { location?: string; locations?: string[]; businessType: string; quantity: number; country?: string; nicheTerms?: string[] }) {
  const country = b.country ?? 'BR';
  // Fora do Brasil o nicho vai no idioma de lá (as variações escolhidas); a quantidade é dividida entre as buscas.
  const terms = country !== 'BR' && b.nicheTerms?.length ? b.nicheTerms : [b.businessType];
  const locations = b.locations?.length ? b.locations : [b.location ?? ''];
  const common = {
    language: countryLanguage(country),
    website: 'allPlaces',
    maxImages: 8,
    maxReviews: 5,
    reviewsSort: 'highestRanking',
    reviewsOrigin: 'google',
    scrapeReviewsPersonalData: false,
  };
  if (locations.length === 1) {
    return { searchStringsArray: terms, locationQuery: mapsPlace(locations[0], country), maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(b.quantity / terms.length)), ...common };
  }
  // Várias cidades: uma busca por cidade, dividindo a quantidade.
  return {
    searchStringsArray: locations.flatMap((l) => terms.map((t) => (country === 'BR' ? `${t} em ${mapsPlace(l, country)}` : `${t}, ${mapsPlace(l, country)}`))),
    maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(b.quantity / (locations.length * terms.length))),
    ...common,
  };
}

/** Um lugar só, pelo link (cadastro manual). */
export function buildPlaceInput(mapsUrl: string) {
  const placeId = /place_id[:=]([\w-]{20,})/.exec(mapsUrl)?.[1];
  return {
    ...(placeId ? { placeIds: [placeId] } : { startUrls: [{ url: mapsUrl }] }),
    maxCrawledPlacesPerSearch: 1, language: 'pt-BR', maxImages: 8, maxReviews: 5, reviewsSort: 'highestRanking', reviewsOrigin: 'google', scrapeReviewsPersonalData: false,
  };
}

/** Países do GeoNames que o ator não aceita como país da busca (sem ele, vale o padrão). */
const GOOGLE_UNSUPPORTED = new Set(['AX', 'BL', 'BQ', 'CW', 'GG', 'IM', 'JE', 'MF', 'SS', 'SX', 'XK']);

/** Entrada do `apify/google-search-scraper`: uma consulta por linha, resultados do país do batch, no idioma dele. */
export function buildGoogleInput(queries: string[], pages: number, country = 'BR') {
  return { queries: queries.join('\n'), maxPagesPerQuery: pages, countryCode: GOOGLE_UNSUPPORTED.has(country) ? '' : country.toLowerCase(), languageCode: countryLanguage(country), mobileResults: false, saveHtml: false, saveHtmlToKeyValueStore: false };
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

/** Data do último post de um perfil. Usado quando o Instagram aparece depois da busca do batch (no site do lead). */
export async function instagramLastPostAt(token: string, instagramUrl: string, onRun?: OnRun): Promise<string | null> {
  const input = buildInstagramInput([instagramUrl]);
  if (!input.usernames.length) return null;
  const [profile] = await runActorSync<InstagramProfile>(token, INSTAGRAM_ACTOR, input, { onRun });
  return profile ? latestPostDate(profile) : null;
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

/** Avisa o id da execução assim que ela começa (para registrar de quem é o gasto). */
export type OnRun = (runId: string) => Promise<void>;

/** Roda o ator e espera o resultado (usado na extração de um link do Instagram). */
export async function runActorSync<T>(token: string, actor: string, input: object, { timeoutMs = 120_000, onRun }: { timeoutMs?: number; onRun?: OnRun } = {}): Promise<T[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { authorization: `Bearer ${token}` };
  const url = new URL(`${BASE}/acts/${actor.replace('/', '~')}/runs`);
  url.searchParams.set('timeout', String(Math.ceil(timeoutMs / 1000)));
  let res = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(input), signal });
  if (!res.ok) throw await failure(res, 'O Apify recusou a leitura');
  type Run = { id: string; status: string; defaultDatasetId?: string };
  let run = ((await res.json()) as { data: Run }).data;
  await onRun?.(run.id);
  while (runOutcome(run.status) === 'pending') {
    // waitForFinish segura a resposta até a execução terminar (no máximo 60 s por chamada).
    res = await fetch(`${BASE}/actor-runs/${run.id}?waitForFinish=30`, { headers, signal });
    if (!res.ok) throw await failure(res, 'O Apify recusou a leitura');
    run = ((await res.json()) as { data: Run }).data;
  }
  if (runOutcome(run.status) === 'failed' || !run.defaultDatasetId) throw new Error(`O Apify não concluiu a leitura (${run.status}).`);
  res = await fetch(`${BASE}/datasets/${run.defaultDatasetId}/items?clean=true`, { headers, signal });
  if (!res.ok) throw await failure(res, 'Não foi possível ler os resultados do Apify');
  return (await res.json()) as T[];
}
