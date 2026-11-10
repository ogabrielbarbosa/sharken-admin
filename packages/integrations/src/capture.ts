import { getEnv, webhookBaseUrl } from '@lps/config';
import { countJobs, createAdminClient, enqueueJob, getBatch, importLeads, listBatches, listLeads, updateBatch, updateLead } from '@lps/db';
import { mapPlaceToLead, type ApifyPlace, type Batch } from '@lps/domain';
import { buildInstagramInput, buildMapsInput, fetchDataset, getRun, INSTAGRAM_ACTOR, latestPostDate, MAPS_ACTOR, runOutcome, startActorRun, usernameFromUrl, type InstagramProfile } from './apify';

function webhookUrl(batchId: string, kind: 'maps' | 'instagram') {
  const env = getEnv();
  const url = new URL('/api/webhooks/apify', webhookBaseUrl(env));
  url.searchParams.set('secret', env.WEBHOOK_SECRET);
  url.searchParams.set('batch', batchId);
  url.searchParams.set('kind', kind);
  return url.toString();
}

export async function startMapsSearch(batch: Batch) {
  const db = createAdminClient();
  try {
    const input = buildMapsInput({ location: batch.location, businessType: batch.business_type, quantity: batch.quantity });
    const runId = await startActorRun(MAPS_ACTOR, input, webhookUrl(batch.id, 'maps'));
    await updateBatch(db, batch.id, { apify_run_id: runId, instagram_run_id: null, status: 'buscando', error: null });
  } catch (err) {
    await updateBatch(db, batch.id, { status: 'erro', error: (err as Error).message });
  }
}

async function enqueueAnalysis(batchId: string) {
  const db = createAdminClient();
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
  const db = createAdminClient();
  const batch = await getBatch(db, batchId);
  if (!batch) return;

  let importError: string | null = null;
  if (event.datasetId) {
    try {
      const items = await fetchDataset<ApifyPlace>(event.datasetId);
      await importLeads(db, items.filter((i) => i.placeId && i.title).map((i) => mapPlaceToLead(i, batchId)));
    } catch (err) {
      importError = (err as Error).message;
    }
  }

  // Webhook repetido: a busca do Instagram já foi iniciada e o retorno dela segue o fluxo.
  if (batch.instagram_run_id) return;

  const pending = await listLeads(db, batchId, ['analisando']);
  const failure = importError ?? (event.succeeded ? null : 'A busca foi interrompida. Os leads encontrados até aqui foram salvos.');
  if (failure) await updateBatch(db, batchId, { status: 'erro', error: failure });

  const usernames = buildInstagramInput(pending.flatMap((l) => (l.instagram_url ? [l.instagram_url] : []))).usernames;
  if (usernames.length && !failure) {
    try {
      const runId = await startActorRun(INSTAGRAM_ACTOR, { usernames }, webhookUrl(batchId, 'instagram'));
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
  const db = createAdminClient();
  if (event.datasetId) {
    try {
      const profiles = await fetchDataset<InstagramProfile>(event.datasetId);
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


/** Consulta as buscas em andamento quando o webhook não alcança este ambiente. */
export async function pollPendingRuns() {
  const db = createAdminClient();
  for (const batch of await listBatches(db)) {
    if (batch.status === 'buscando' && batch.apify_run_id) {
      const run = await getRun(batch.apify_run_id);
      const outcome = runOutcome(run.status);
      if (outcome !== 'pending') await handleMapsResult(batch.id, { succeeded: outcome === 'succeeded', datasetId: run.defaultDatasetId });
    } else if (batch.status === 'analisando' && batch.instagram_run_id && (await countJobs(db, 'analyze_lead', batch.id)) === 0) {
      const run = await getRun(batch.instagram_run_id);
      if (runOutcome(run.status) !== 'pending') await handleInstagramResult(batch.id, { datasetId: run.defaultDatasetId });
    }
  }
}
