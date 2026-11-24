import { getBatch, NO_BATCH } from '@lps/db';
import { batchName, DEFAULT_CRITERIA, type Batch } from '@lps/domain';
import { notFound } from 'next/navigation';
import { authedDb } from './auth';

export const NO_BATCH_LABEL = 'Leads sem batch';

/** Quadro fixo dos leads que não estão em batch nenhum. */
const noBatch: Batch = {
  id: NO_BATCH, created_at: '', location: NO_BATCH_LABEL, location_key: '', business_type: '', quantity: 0, criteria: DEFAULT_CRITERIA, status: 'concluido', error: null,
  apify_run_id: null, instagram_run_id: null, workspace_id: '', source: 'manual', locations: [], niche_terms: [], location_terms: [], google_run_id: null, profiles_run_id: null,
};

export async function loadBatchContext(id: string) {
  const db = await authedDb();
  const batch = id === NO_BATCH ? noBatch : await getBatch(db, id);
  if (!batch) notFound();
  return { db, batch };
}

export const batchLabel = batchName;
