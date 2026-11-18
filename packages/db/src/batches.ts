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

/**
 * Apaga o batch. Os leads que nunca chegaram ao CRM (sem contato nem cliente) vão junto, com os itens deles;
 * os que já têm conversa ou cliente ficam, sem batch, para o CRM e para não voltarem num batch novo.
 * Devolve os caminhos dos arquivos dos leads apagados, para quem chamou limpar o storage.
 */
export async function deleteBatch(db: Db, id: string): Promise<{ storagePaths: string[] }> {
  const { data: leads, error } = await db.from('leads').select('id').eq('batch_id', id);
  if (error) throw new Error(error.message);
  const ids = (leads as { id: string }[]).map((l) => l.id);

  let removable: string[] = [];
  let storagePaths: string[] = [];
  if (ids.length) {
    const [contacts, clients] = await Promise.all([
      db.from('contacts').select('lead_id').in('lead_id', ids),
      db.from('clients').select('lead_id').in('lead_id', ids),
    ]);
    if (contacts.error) throw new Error(contacts.error.message);
    if (clients.error) throw new Error(clients.error.message);
    const kept = new Set([...(contacts.data ?? []), ...(clients.data ?? [])].map((r) => r.lead_id as string));
    removable = ids.filter((l) => !kept.has(l));

    if (removable.length) {
      const { data: assets, error: assetsError } = await db.from('lead_assets').select('storage_path').in('lead_id', removable).not('storage_path', 'is', null);
      if (assetsError) throw new Error(assetsError.message);
      storagePaths = (assets as { storage_path: string }[]).map((a) => a.storage_path);
    }
  }

  // Tarefas do batch que ainda não rodaram não têm mais o que fazer.
  await db.from('jobs').delete().eq('status', 'pendente').eq('payload->>batch_id', id);
  if (removable.length) {
    const { error: leadsError } = await db.from('leads').delete().in('id', removable);
    if (leadsError) throw new Error(`Falha ao apagar os leads: ${leadsError.message}`);
  }
  const { error: batchError } = await db.from('batches').delete().eq('id', id);
  if (batchError) throw new Error(`Falha ao apagar o batch: ${batchError.message}`);
  return { storagePaths };
}
