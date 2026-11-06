import { getBatch, listBatchStages } from '@lps/db';
import { summarizeBatch } from '@lps/domain';
import { notFound } from 'next/navigation';
import { authedDb } from './auth';

export async function loadBatchContext(id: string) {
  const db = await authedDb();
  const batch = await getBatch(db, id);
  if (!batch) notFound();
  const stages = await listBatchStages(db);
  return { db, batch, summary: summarizeBatch(stages.filter((s) => s.batch_id === id)) };
}

export const batchLabel = (b: { location: string; business_type: string }) => `${b.location} · ${b.business_type}`;
