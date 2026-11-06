import type { Batch, Criteria } from '@lps/domain';
import { toLocationKey } from '@lps/domain';
import type { Db } from './client';

export async function createBatch(db: Db, b: { location: string; businessType: string; quantity: number; criteria: Criteria }): Promise<Batch> {
  const { data, error } = await db
    .from('batches')
    .insert({
      location: b.location.trim(),
      location_key: toLocationKey(b.location),
      business_type: b.businessType.trim(),
      quantity: b.quantity,
      criteria: b.criteria,
    })
    .select()
    .single();
  if (error) throw new Error(`Falha ao criar o batch: ${error.message}`);
  return data as Batch;
}

export async function getBatch(db: Db, id: string): Promise<Batch | null> {
  const { data } = await db.from('batches').select().eq('id', id).maybeSingle();
  return data as Batch | null;
}

export async function listBatches(db: Db): Promise<Batch[]> {
  const { data, error } = await db.from('batches').select().order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Batch[];
}

export async function updateBatch(db: Db, id: string, patch: Partial<Batch>) {
  const { error } = await db.from('batches').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
