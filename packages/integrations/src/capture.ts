import { getEnv, webhookBaseUrl } from '@lps/config';
import { countJobs, createAdminClient, enqueueJob, getApifyToken, getBatch, importLeads, listBatches, listKnownPlaceIds, listLeads, scopeDb, updateBatch, updateLead, workspaceOfRow, type Db } from '@lps/db';
import { mapPlaceToLead, type ApifyPlace, type Batch } from '@lps/domain';
import { APIFY_NOT_CONNECTED, buildInstagramInput, buildMapsInput, fetchDataset, getRun, INSTAGRAM_ACTOR, latestPostDate, MAPS_ACTOR, runOutcome, shouldPollRuns, startActorRun, usernameFromUrl, type InstagramProfile } from './apify';

function webhookUrl(batchId: string, kind: 'maps' | 'instagram'): string | null {
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
    const input = buildMapsInput({ location: batch.location, businessType: batch.business_type, quantity: batch.quantity });
    const runId = await startActorRun(token, MAPS_ACTOR, input, webhookUrl(batch.id, 'maps'));
    await updateBatch(db, batch.id, { apify_run_id: runId, instagram_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
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
      const known = await listKnownPlaceIds(db, leads.map((l) => l.place_id));
      const fresh = leads.filter((l) => !known.has(l.place_id));
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
      if (batch.status === 'buscando' && batch.apify_run_id) {
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
