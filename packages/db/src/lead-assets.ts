import type { LeadAsset } from '@lps/domain';
import type { Db } from './client';

export async function listAssets(db: Db, leadId: string): Promise<LeadAsset[]> {
  const { data, error } = await db.from('lead_assets').select('*').eq('lead_id', leadId).order('created_at');
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`);
  return data as LeadAsset[];
}

export async function getAsset(db: Db, id: string): Promise<LeadAsset | null> {
  const { data } = await db.from('lead_assets').select('*').eq('id', id).maybeSingle();
  return (data as LeadAsset | null) ?? null;
}

export type NewAsset = Pick<LeadAsset, 'lead_id' | 'kind'> & Partial<Pick<LeadAsset, 'label' | 'url' | 'storage_path' | 'mime_type' | 'body' | 'status'>>;

export async function addAsset(db: Db, row: NewAsset): Promise<LeadAsset> {
  const { data, error } = await db.from('lead_assets').insert(row).select('*').single();
  if (error) throw new Error(`Falha ao salvar item: ${error.message}`);
  return data as LeadAsset;
}

export async function updateAsset(db: Db, id: string, patch: Partial<LeadAsset>) {
  const { error } = await db.from('lead_assets').update(patch).eq('id', id);
  if (error) throw new Error(`Falha ao atualizar item: ${error.message}`);
}

export async function deleteAsset(db: Db, id: string) {
  const { error } = await db.from('lead_assets').delete().eq('id', id);
  if (error) throw new Error(`Falha ao remover item: ${error.message}`);
}
