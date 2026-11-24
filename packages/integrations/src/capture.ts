import { getEnv, webhookBaseUrl } from '@lps/config';
import { batchLocations, countJobs, createAdminClient, enqueueJob, getApifyToken, getBatch, importLeads, leadsByInstagramHandles, linkExistingLeads, listBatches, listKnownPlaceIds, listLeads, recordApifyRun, scopeDb, updateBatch, updateLead, workspaceOfRow, type Db } from '@lps/db';
import { batchCountry, buildInstagramQueries, cityName, handlesFromSearch, mapPlaceToLead, handlesFromNetwork, mapProfileToLead, PROFILE_BATCH_NICHE, searchPagesFor, type NetworkRun, type ProfileRelation, type ApifyPlace, type Batch, type GoogleSearchPage, type InstagramProfileData } from '@lps/domain';
import { APIFY_NOT_CONNECTED, buildGoogleInput, buildInstagramInput, buildMapsInput, fetchDataset, getRun, GOOGLE_ACTOR, INSTAGRAM_ACTOR, latestPostDate, MAPS_ACTOR, NETWORK_ACTOR, runOutcome, shouldPollRuns, startActorRun, usernameFromUrl, type InstagramProfile } from './apify';

export type RunKind = 'maps' | 'instagram' | 'google' | 'network' | 'profiles';

function webhookUrl(batchId: string, kind: RunKind): string | null {
  const env = getEnv();
  // O Apify recusa localhost. No local o worker consulta o resultado no lugar do webhook.
  if (shouldPollRuns(env)) return null;
  const url = new URL('/api/webhooks/apify', webhookBaseUrl(env));
  url.searchParams.set('secret', env.WEBHOOK_SECRET);
  url.searchParams.set('batch', batchId);
  url.searchParams.set('kind', kind);
  return url.toString();
}

/** Token do Apify do workspace (cada um busca na própria conta). */
const tokenOf = (workspaceId: string) => getApifyToken(createAdminClient(), workspaceId);

export async function workspaceHasApify(workspaceId: string): Promise<boolean> {
  return !!(await tokenOf(workspaceId));
}

/** Cliente preso ao workspace do batch (leads, tarefas e deduplicação ficam dentro dele) e o token dele. */
async function batchContext(batchId: string): Promise<{ db: Db; token: string | null } | null> {
  const workspaceId = await workspaceOfRow(createAdminClient(), 'batches', batchId);
  if (!workspaceId) return null;
  return { db: scopeDb(createAdminClient(), workspaceId), token: await tokenOf(workspaceId) };
}

async function batchDb(batchId: string): Promise<Db | null> {
  return (await batchContext(batchId))?.db ?? null;
}

export async function startMapsSearch(batch: Batch) {
  const db = scopeDb(createAdminClient(), batch.workspace_id);
  try {
    const token = await tokenOf(batch.workspace_id);
    if (!token) {
      await updateBatch(db, batch.id, { status: 'erro', error: APIFY_NOT_CONNECTED });
      return;
    }
    const input = buildMapsInput({ locations: batchLocations(batch), businessType: batch.business_type, quantity: batch.quantity, country: batchCountry(batch), nicheTerms: batch.niche_terms });
    const runId = await startActorRun(token, MAPS_ACTOR, input, webhookUrl(batch.id, 'maps'));
    await recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: batch.workspace_id, actor: MAPS_ACTOR, purpose: 'maps', batch_id: batch.id });
    // Só uma busca por vez no batch: as execuções da outra fonte já terminaram.
    await updateBatch(db, batch.id, { apify_run_id: runId, instagram_run_id: null, google_run_id: null, profiles_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

/** Termos da busca do Instagram: as variações escolhidas, ou o nicho e os nomes das cidades. */
export function instagramSearchTerms(batch: Pick<Batch, 'business_type' | 'location' | 'locations' | 'niche_terms' | 'location_terms'>) {
  const cities = batchLocations(batch).map(cityName);
  return {
    niches: batch.niche_terms?.length ? batch.niche_terms : [batch.business_type],
    locations: batch.location_terms?.length ? batch.location_terms : cities.map((c) => c.toLowerCase()),
  };
}

/** Busca no Google os perfis do Instagram do nicho na região (site:instagram.com ...). */
export async function startInstagramSearch(batch: Batch) {
  const db = scopeDb(createAdminClient(), batch.workspace_id);
  try {
    const token = await tokenOf(batch.workspace_id);
    if (!token) {
      await updateBatch(db, batch.id, { status: 'erro', error: APIFY_NOT_CONNECTED });
      return;
    }
    const terms = instagramSearchTerms(batch);
    const queries = buildInstagramQueries(terms.niches, terms.locations);
    if (!queries.length) throw new Error('Informe o nicho para buscar no Instagram.');
    const runId = await startActorRun(token, GOOGLE_ACTOR, buildGoogleInput(queries, searchPagesFor(batch.quantity, queries.length), batchCountry(batch)), webhookUrl(batch.id, 'google'));
    await recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: batch.workspace_id, actor: GOOGLE_ACTOR, purpose: 'google', batch_id: batch.id });
    await updateBatch(db, batch.id, { google_run_id: runId, profiles_run_id: null, apify_run_id: null, instagram_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

/** Busca do batch pela fonte dele. */
export const startBatchSearch = (batch: Batch) =>
  batch.source === 'instagram_profile' ? startNetworkSearch(batch) : batch.source === 'instagram' ? startInstagramSearch(batch) : startMapsSearch(batch);

async function startNetworkRun(db: Db, token: string, batch: Batch, relation: ProfileRelation, done: NetworkRun[]) {
  const input = { usernames: [batch.source_profile], dataToScrape: relation, resultsLimit: batch.quantity };
  const runId = await startActorRun(token, NETWORK_ACTOR, input, webhookUrl(batch.id, 'network'));
  await recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: batch.workspace_id, actor: NETWORK_ACTOR, purpose: 'network', batch_id: batch.id });
  await updateBatch(db, batch.id, {
    network_runs: [...done, { relation, run_id: runId, dataset_id: null }],
    google_run_id: null, profiles_run_id: null, apify_run_id: null, instagram_run_id: null, status: 'buscando', error: null,
  });
}

/** Lista quem o perfil segue e/ou os seguidores dele (uma execução por lista, uma depois da outra). */
export async function startNetworkSearch(batch: Batch) {
  const db = scopeDb(createAdminClient(), batch.workspace_id);
  try {
    const token = await tokenOf(batch.workspace_id);
    if (!token) throw new Error(APIFY_NOT_CONNECTED);
    const [first] = batch.source_relations ?? [];
    if (!batch.source_profile || !first) throw new Error('Informe o perfil e o que puxar dele.');
    await startNetworkRun(db, token, batch, first, []);
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

/** Uma lista pronta: começa a próxima ou, com todas, segue para a leitura dos perfis. */
export async function handleNetworkResult(batchId: string, event: { succeeded: boolean; datasetId: string | null; runId: string | null }) {
  const ctx = await batchContext(batchId);
  if (!ctx) return;
  const { db, token } = ctx;
  const batch = await getBatch(db, batchId);
  const runs = batch?.network_runs ?? [];
  const last = runs.at(-1);
  // Webhook repetido ou de uma execução anterior.
  if (!batch?.source_profile || batch.status !== 'buscando' || batch.profiles_run_id || !last || last.run_id !== event.runId) return;
  try {
    if (!token) throw new Error(APIFY_NOT_CONNECTED);
    if (!event.succeeded || !event.datasetId) throw new Error('A leitura da lista do perfil foi interrompida.');
    const done = [...runs.slice(0, -1), { ...last, dataset_id: event.datasetId }];
    const next = batch.source_relations?.find((r) => !done.some((d) => d.relation === r));
    if (next) {
      await startNetworkRun(db, token, batch, next, done);
      return;
    }
    const rows = [];
    for (const run of done) rows.push(...(await fetchDataset<{ username?: string }>(token, run.dataset_id!)).slice(0, batch.quantity));
    const handles = handlesFromNetwork(rows, batch.source_profile);
    if (!handles.length) throw new Error('O Instagram não mostrou a lista deste perfil. Confira se ele existe e é público.');
    await updateBatch(db, batchId, { network_runs: done });
    await readProfiles(db, token, batch, handles);
  } catch (err) {
    await updateBatch(db, batchId, { status: 'erro', error: (err as Error).message });
  }
}

/** Os perfis já conhecidos entram no batch na etapa em que estão; os novos vão para a leitura (bio, link, telefone, posts). */
async function readProfiles(db: Db, token: string, batch: Batch, handles: string[]) {
  const known = await leadsByInstagramHandles(db, handles);
  if (known.length) await linkExistingLeads(db, batch.id, known);
  const knownHandles = new Set(known.map((l) => l.instagram_handle));
  const fresh = handles.filter((h) => !knownHandles.has(h));
  if (!fresh.length) {
    await enqueueAnalysis(batch.id);
    return;
  }
  const runId = await startActorRun(token, INSTAGRAM_ACTOR, { usernames: fresh }, webhookUrl(batch.id, 'profiles'));
  await recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: batch.workspace_id, actor: INSTAGRAM_ACTOR, purpose: 'profiles', batch_id: batch.id });
  await updateBatch(db, batch.id, { profiles_run_id: runId, status: 'buscando' });
}

/**
 * Resultado da busca no Google: os perfis já conhecidos entram no batch na etapa em que estão; os novos vão
 * para a leitura do perfil (bio, link, telefone, posts).
 */
export async function handleGoogleResult(batchId: string, event: { succeeded: boolean; datasetId: string | null }) {
  const ctx = await batchContext(batchId);
  if (!ctx) return;
  const { db, token } = ctx;
  const batch = await getBatch(db, batchId);
  // Webhook repetido: a leitura dos perfis já começou.
  if (!batch || batch.profiles_run_id) return;
  if (!token) {
    await updateBatch(db, batchId, { status: 'erro', error: APIFY_NOT_CONNECTED });
    return;
  }
  try {
    if (!event.datasetId) throw new Error('A busca no Google foi interrompida.');
    const handles = handlesFromSearch(await fetchDataset<GoogleSearchPage>(token, event.datasetId)).slice(0, batch.quantity);
    if (!handles.length && !event.succeeded) throw new Error('A busca no Google foi interrompida.');
    await readProfiles(db, token, batch, handles);
  } catch (err) {
    await updateBatch(db, batchId, { status: 'erro', error: (err as Error).message });
  }
}

/** Perfis lidos, como leads do batch. */
export function profileLeads(batch: Batch, profiles: InstagramProfileData[]) {
  const network = batch.source === 'instagram_profile';
  // Batch de perfil não tem cidade.
  const cities = network ? [] : batchLocations(batch).map(cityName);
  const businessType = network && batch.business_type === PROFILE_BATCH_NICHE ? null : batch.business_type;
  const plain = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return profiles.flatMap((p) => {
    // A cidade é a que aparece na bio; sem nenhuma, a primeira do batch.
    const city = cities.find((c) => plain(p.biography ?? '').includes(plain(c))) ?? cities[0] ?? null;
    const lead = mapProfileToLead(p, batch.id, { city, businessType, country: batchCountry(batch) });
    return lead ? [lead] : [];
  });
}

/** Perfis lidos: viram leads (cruzando com os que já existem) e seguem para a análise. */
export async function handleProfilesResult(batchId: string, event: { datasetId: string | null }) {
  const ctx = await batchContext(batchId);
  if (!ctx) return;
  const { db, token } = ctx;
  const batch = await getBatch(db, batchId);
  if (!batch) return;
  if (event.datasetId && token) {
    try {
      const profiles = await fetchDataset<InstagramProfileData>(token, event.datasetId);
      const leads = profileLeads(batch, profiles);
      await importLeads(db, leads);
    } catch (err) {
      await updateBatch(db, batchId, { status: 'erro', error: (err as Error).message });
    }
  }
  await enqueueAnalysis(batchId);
}

async function enqueueAnalysis(batchId: string) {
  const db = await batchDb(batchId);
  if (!db) return;
  const leads = await listLeads(db, batchId, ['analisando']);
  await updateBatch(db, batchId, { status: leads.length ? 'analisando' : 'concluido' });
  for (const lead of leads) {
    await enqueueJob(db, {
      type: 'analyze_lead',
      payload: { lead_id: lead.id, batch_id: batchId },
      dedupeKey: `analyze_lead:${lead.id}`,
    });
  }
}

export async function handleMapsResult(batchId: string, event: { succeeded: boolean; datasetId: string | null }) {
  const ctx = await batchContext(batchId);
  if (!ctx) return;
  const { db, token } = ctx;
  const batch = await getBatch(db, batchId);
  if (!batch) return;

  let importError: string | null = null;
  if (event.datasetId && token) {
    try {
      const items = await fetchDataset<ApifyPlace>(token, event.datasetId);
      await importLeads(db, items.filter((i) => i.placeId && i.title).map((i) => mapPlaceToLead(i, batchId, batchCountry(batch))));
    } catch (err) {
      importError = (err as Error).message;
    }
  }

  // Webhook repetido: a busca do Instagram já foi iniciada e o retorno dela segue o fluxo.
  if (batch.instagram_run_id) return;

  if (!token) {
    // O token foi removido depois de a busca começar: sem ele não dá para ler o resultado. Os leads que já
    // tinham entrado seguem para a análise (ela usa o Claude, não o Apify). Batch que já passou da busca fica como está.
    if (batch.status !== 'buscando') return;
    await updateBatch(db, batchId, { status: 'erro', error: APIFY_NOT_CONNECTED });
    for (const lead of await listLeads(db, batchId, ['analisando'])) {
      await enqueueJob(db, { type: 'analyze_lead', payload: { lead_id: lead.id, batch_id: batchId }, dedupeKey: `analyze_lead:${lead.id}` });
    }
    return;
  }

  const pending = await listLeads(db, batchId, ['analisando']);
  const failure = importError ?? (event.succeeded ? null : 'A busca foi interrompida. Os leads encontrados até aqui foram salvos.');
  if (failure) await updateBatch(db, batchId, { status: 'erro', error: failure });

  const usernames = buildInstagramInput(pending.flatMap((l) => (l.instagram_url ? [l.instagram_url] : []))).usernames;
  if (usernames.length && !failure) {
    try {
      const runId = await startActorRun(token, INSTAGRAM_ACTOR, { usernames }, webhookUrl(batchId, 'instagram'));
      await recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: batch.workspace_id, actor: INSTAGRAM_ACTOR, purpose: 'instagram', batch_id: batchId });
      await updateBatch(db, batchId, { instagram_run_id: runId, status: 'analisando' });
      return;
    } catch {
      // Sem Instagram o lead só deixa de pontuar esse critério.
    }
  }
  if (failure) {
    for (const lead of pending) {
      await enqueueJob(db, { type: 'analyze_lead', payload: { lead_id: lead.id, batch_id: batchId }, dedupeKey: `analyze_lead:${lead.id}` });
    }
    return;
  }
  await enqueueAnalysis(batchId);
}

export async function handleInstagramResult(batchId: string, event: { datasetId: string | null }) {
  const ctx = await batchContext(batchId);
  if (!ctx) return;
  const { db, token } = ctx;
  // Sem token o Instagram é pulado: o lead só deixa de pontuar esse critério.
  if (event.datasetId && token) {
    try {
      const profiles = await fetchDataset<InstagramProfile>(token, event.datasetId);
      const dates = new Map(profiles.map((p) => [p.username?.toLowerCase(), latestPostDate(p)]));
      for (const lead of await listLeads(db, batchId, ['analisando'])) {
        const date = lead.instagram_url ? dates.get(usernameFromUrl(lead.instagram_url) ?? '') : null;
        if (date) await updateLead(db, lead.id, { instagram_last_post_at: date });
      }
    } catch {
      // Falha no Instagram não impede a análise.
    }
  }
  await enqueueAnalysis(batchId);
}

/** Grava os negócios que o Apify já achou, sem esperar a busca terminar. A análise continua só no fim. */
export async function syncSearchProgress() {
  for (const batch of await listBatches(createAdminClient())) {
    if (batch.status !== 'buscando' || !batch.apify_run_id) continue;
    const db = scopeDb(createAdminClient(), batch.workspace_id);
    try {
      const token = await tokenOf(batch.workspace_id);
      if (!token) continue;
      const run = await getRun(token, batch.apify_run_id);
      if (!run.defaultDatasetId) continue;
      const items = await fetchDataset<ApifyPlace>(token, run.defaultDatasetId);
      const leads = items.filter((i) => i.placeId && i.title).map((i) => mapPlaceToLead(i, batch.id, batchCountry(batch)));
      const known = await listKnownPlaceIds(db, leads.map((l) => l.place_id!));
      const fresh = leads.filter((l) => !known.has(l.place_id!));
      if (fresh.length) await importLeads(db, fresh);
    } catch (err) {
      console.error(`[apify] progresso do batch ${batch.id}: ${(err as Error).message}`);
    }
  }
}

/** Consulta as buscas em andamento quando o webhook não alcança este ambiente. */
export async function pollPendingRuns() {
  for (const batch of await listBatches(createAdminClient())) {
    const db = scopeDb(createAdminClient(), batch.workspace_id);
    try {
      if (batch.status === 'buscando' && (batch.profiles_run_id || batch.google_run_id || batch.network_runs?.length) && !batch.apify_run_id) {
        const token = await tokenOf(batch.workspace_id);
        if (!token) {
          await updateBatch(db, batch.id, { status: 'erro', error: APIFY_NOT_CONNECTED });
          continue;
        }
        const run = await getRun(token, (batch.profiles_run_id ?? batch.google_run_id ?? batch.network_runs?.at(-1)?.run_id)!);
        const outcome = runOutcome(run.status);
        if (outcome === 'pending') continue;
        if (batch.profiles_run_id) await handleProfilesResult(batch.id, { datasetId: run.defaultDatasetId });
        else if (!batch.google_run_id) await handleNetworkResult(batch.id, { succeeded: outcome === 'succeeded', datasetId: run.defaultDatasetId, runId: batch.network_runs!.at(-1)!.run_id });
        else await handleGoogleResult(batch.id, { succeeded: outcome === 'succeeded', datasetId: run.defaultDatasetId });
      } else if (batch.status === 'buscando' && batch.apify_run_id) {
        const token = await tokenOf(batch.workspace_id);
        if (!token) {
          await handleMapsResult(batch.id, { succeeded: false, datasetId: null });
          continue;
        }
        const run = await getRun(token, batch.apify_run_id);
        const outcome = runOutcome(run.status);
        if (outcome !== 'pending') await handleMapsResult(batch.id, { succeeded: outcome === 'succeeded', datasetId: run.defaultDatasetId });
      } else if (batch.status === 'analisando' && batch.instagram_run_id && (await countJobs(db, 'analyze_lead', batch.id)) === 0) {
        const token = await tokenOf(batch.workspace_id);
        if (!token) {
          await handleInstagramResult(batch.id, { datasetId: null });
          continue;
        }
        const run = await getRun(token, batch.instagram_run_id);
        if (runOutcome(run.status) !== 'pending') await handleInstagramResult(batch.id, { datasetId: run.defaultDatasetId });
      }
    } catch (err) {
      console.error(`[apify] consulta do batch ${batch.id}: ${(err as Error).message}`);
    }
  }
}
