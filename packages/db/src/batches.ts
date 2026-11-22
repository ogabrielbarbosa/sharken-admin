import type { Batch, BatchSource, Criteria } from '@lps/domain';
import { toLocationKey } from '@lps/domain';
import type { Db } from './client';

export type NewBatch = {
  /** Cidades no formato "Cidade, UF". A primeira dá nome ao batch no filtro de localização. */
  locations: string[];
  businessType: string;
  quantity: number;
  criteria: Criteria;
  source?: BatchSource;
  nicheTerms?: string[];
  locationTerms?: string[];
};

export async function createBatch(db: Db, b: NewBatch): Promise<Batch> {
  const locations = b.locations.map((l) => l.trim()).filter(Boolean);
  if (!locations.length) throw new Error('Escolha pelo menos uma cidade.');
  const { data, error } = await db
    .from('batches')
    .insert({
      location: locations.join(' + '),
      location_key: toLocationKey(locations[0]),
      locations,
      business_type: b.businessType.trim(),
      quantity: b.quantity,
      criteria: b.criteria,
      source: b.source ?? 'instagram',
      niche_terms: b.nicheTerms ?? [],
      location_terms: b.locationTerms ?? [],
    })
    .select()
    .single();
  if (error) throw new Error(`Falha ao criar o batch: ${error.message}`);
  return data as Batch;
}

/** Cidades do batch (os antigos só têm `location`). */
export const batchLocations = (b: Pick<Batch, 'location' | 'locations'>) => (b.locations?.length ? b.locations : [b.location]);

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
  const { data: links, error } = await db.from('batch_leads').select('lead_id').eq('batch_id', id);
  if (error) throw new Error(error.message);
  const linked = (links as { lead_id: string }[]).map((l) => l.lead_id);
  // Lead que também está em outro batch fica, e esse outro passa a ser o batch de origem dele.
  const elsewhere = new Map<string, string>();
  if (linked.length) {
    const { data: other, error: otherError } = await db.from('batch_leads').select('lead_id, batch_id').in('lead_id', linked).neq('batch_id', id);
    if (otherError) throw new Error(otherError.message);
    for (const o of other as { lead_id: string; batch_id: string }[]) elsewhere.set(o.lead_id, o.batch_id);
  }
  for (const [leadId, batchId] of elsewhere) await db.from('leads').update({ batch_id: batchId }).eq('id', leadId).eq('batch_id', id);
  const ids = linked.filter((l) => !elsewhere.has(l));

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
