import type { Lead, LeadStage } from '@lps/domain';
import type { Db } from './client';

const COLUMNS = 'id, created_at, batch_id, name, business_type, city, phone_raw, phone_e164, email, rating, reviews_count, place_id, website_url, site_status, instagram_url, stage, score';
export type LeadListRow = Pick<Lead,
  'id' | 'created_at' | 'batch_id' | 'name' | 'business_type' | 'city' | 'phone_raw' | 'phone_e164' | 'email' | 'rating' | 'reviews_count'
  | 'place_id' | 'website_url' | 'site_status' | 'instagram_url' | 'stage' | 'score'> & { found: { batch_id: string }[] };

export const LEADS_PAGE = 50;

/** Todos os leads do workspace, do mais novo para o mais antigo, uma página por vez. `batchIds` filtra por onde apareceram. */
export async function listAllLeads(db: Db, f: { q?: string; batchIds?: string[]; noBatch?: boolean; stages?: LeadStage[]; page: number }): Promise<{ leads: LeadListRow[]; total: number }> {
  if (f.batchIds && !f.batchIds.length) return { leads: [], total: 0 };
  const from = (f.page - 1) * LEADS_PAGE;
  let query = db.from('leads').select(`${COLUMNS}, found:batch_leads(batch_id)${f.batchIds ? ', match:batch_leads!inner(batch_id)' : ''}`, { count: 'exact' });
  if (f.batchIds) query = query.in('match.batch_id', f.batchIds);
  // Nenhum vínculo com batch (o batch foi apagado, ou o lead nunca teve um).
  if (f.noBatch) query = query.is('found', null);
  if (f.stages) query = query.in('stage', f.stages);
  if (f.q) query = query.ilike('name', `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(from, from + LEADS_PAGE - 1);
  // Página depois do fim.
  if (error?.code === 'PGRST103') return { leads: [], total: count ?? 0 };
  if (error) throw new Error(error.message);
  return { leads: data as unknown as LeadListRow[], total: count ?? 0 };
}
