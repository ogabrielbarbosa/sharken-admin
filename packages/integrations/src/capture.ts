import { getEnv, webhookBaseUrl } from '@lps/config';
import { batchLocations, countJobs, createAdminClient, enqueueJob, getApifyToken, getBatch, importLeads, leadsByInstagramHandles, linkExistingLeads, listBatches, listKnownPlaceIds, listLeads, scopeDb, updateBatch, updateLead, workspaceOfRow, type Db } from '@lps/db';
import { buildInstagramQueries, findMunicipio, handlesFromSearch, mapPlaceToLead, mapProfileToLead, searchPagesFor, type ApifyPlace, type Batch, type GoogleSearchPage, type InstagramProfileData } from '@lps/domain';
import { APIFY_NOT_CONNECTED, buildGoogleInput, buildInstagramInput, buildMapsInput, fetchDataset, getRun, GOOGLE_ACTOR, INSTAGRAM_ACTOR, latestPostDate, MAPS_ACTOR, runOutcome, shouldPollRuns, startActorRun, usernameFromUrl, type InstagramProfile } from './apify';

export type RunKind = 'maps' | 'instagram' | 'google' | 'profiles';

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
    const input = buildMapsInput({ locations: batchLocations(batch), businessType: batch.business_type, quantity: batch.quantity });
    const runId = await startActorRun(token, MAPS_ACTOR, input, webhookUrl(batch.id, 'maps'));
    // Só uma busca por vez no batch: as execuções da outra fonte já terminaram.
    await updateBatch(db, batch.id, { apify_run_id: runId, instagram_run_id: null, google_run_id: null, profiles_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

/** Termos da busca do Instagram: as variações escolhidas, ou o nicho e os nomes das cidades. */
export function instagramSearchTerms(batch: Pick<Batch, 'business_type' | 'location' | 'locations' | 'niche_terms' | 'location_terms'>) {
  const cities = batchLocations(batch).map((l) => findMunicipio(l)?.nome ?? l.split(',')[0]);
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
    const runId = await startActorRun(token, GOOGLE_ACTOR, buildGoogleInput(queries, searchPagesFor(batch.quantity, queries.length)), webhookUrl(batch.id, 'google'));
    await updateBatch(db, batch.id, { google_run_id: runId, profiles_run_id: null, apify_run_id: null, instagram_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

/** Busca do batch pela fonte dele. */
export const startBatchSearch = (batch: Batch) => (batch.source === 'instagram' ? startInstagramSearch(batch) : startMapsSearch(batch));

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
    const known = await leadsByInstagramHandles(db, handles);
    if (known.length) await linkExistingLeads(db, batchId, known);
    const knownHandles = new Set(known.map((l) => l.instagram_handle));
    const fresh = handles.filter((h) => !knownHandles.has(h));
    if (!fresh.length) {
      if (!handles.length && !event.succeeded) throw new Error('A busca no Google foi interrompida.');
      await enqueueAnalysis(batchId);
      return;
    }
    const runId = await startActorRun(token, INSTAGRAM_ACTOR, { usernames: fresh }, webhookUrl(batchId, 'profiles'));
    await updateBatch(db, batchId, { profiles_run_id: runId, status: 'buscando' });
  } catch (err) {
    await updateBatch(db, batchId, { status: 'erro', error: (err as Error).message });
  }
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
      const cities = batchLocations(batch).map((l) => findMunicipio(l)?.nome ?? l.split(',')[0]);
      const plain = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const leads = profiles.flatMap((p) => {
        // A cidade é a que aparece na bio; sem nenhuma, a primeira do batch.
        const city = cities.find((c) => plain(p.biography ?? '').includes(plain(c))) ?? cities[0] ?? null;
        const lead = mapProfileToLead(p, batchId, { city, businessType: batch.business_type });
        return lead ? [lead] : [];
      });
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
      await importLeads(db, items.filter((i) => i.placeId && i.title).map((i) => mapPlaceToLead(i, batchId)));
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
      const leads = items.filter((i) => i.placeId && i.title).map((i) => mapPlaceToLead(i, batch.id));
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
      if (batch.status === 'buscando' && (batch.profiles_run_id || batch.google_run_id)) {
        const token = await tokenOf(batch.workspace_id);
        if (!token) {
          await updateBatch(db, batch.id, { status: 'erro', error: APIFY_NOT_CONNECTED });
          continue;
        }
        const run = await getRun(token, (batch.profiles_run_id ?? batch.google_run_id)!);
        const outcome = runOutcome(run.status);
        if (outcome === 'pending') continue;
        if (batch.profiles_run_id) await handleProfilesResult(batch.id, { datasetId: run.defaultDatasetId });
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
