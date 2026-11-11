import { getBatch } from '@lps/db';
import { notFound } from 'next/navigation';
import { authedDb } from './auth';

export async function loadBatchContext(id: string) {
  const db = await authedDb();
  const batch = await getBatch(db, id);
  if (!batch) notFound();
  return { db, batch };
}

export const batchLabel = (b: { location: string; business_type: string }) => `${b.location} · ${b.business_type}`;
