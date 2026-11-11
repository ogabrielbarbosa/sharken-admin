import { assertTransition, classifyLink, dedupeLeads, mergeLeadOnReimport, type Lead, type LeadStage, type NewLead } from '@lps/domain';
import type { Db } from './client';
import { fetchAll } from './fetch-all';

export async function getLead(db: Db, id: string): Promise<Lead | null> {
  const { data } = await db.from('leads').select().eq('id', id).maybeSingle();
  return data as Lead | null;
}

export async function listLeads(db: Db, batchId: string, stages?: LeadStage[]): Promise<Lead[]> {
  let query = db.from('leads').select().eq('batch_id', batchId);
  if (stages) query = query.in('stage', stages);
  const { data, error } = await query.order('score', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data as Lead[];
}

/** Place IDs que já estão no banco, para gravar só os negócios novos durante a busca. */
export async function listKnownPlaceIds(db: Db, placeIds: string[]): Promise<Set<string>> {
  if (!placeIds.length) return new Set();
  const { data, error } = await db.from('leads').select('place_id').in('place_id', placeIds);
  if (error) throw new Error(error.message);
  return new Set((data as { place_id: string }[]).map((l) => l.place_id));
}

export async function listBatchStages(db: Db): Promise<{ batch_id: string; stage: LeadStage }[]> {
  return fetchAll((from, to) => db.from('leads').select('batch_id, stage').not('batch_id', 'is', null).order('id').range(from, to)) as Promise<{ batch_id: string; stage: LeadStage }[]>;
}

export async function updateLead(db: Db, id: string, patch: Partial<Lead>) {
  const { error } = await db.from('leads').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function logEvent(db: Db, leadId: string, type: string, data: object = {}) {
  await db.from('events').insert({ lead_id: leadId, type, data });
}

/** Única forma de mudar a etapa: valida a transição e registra o evento. */
export async function moveLead(db: Db, lead: Pick<Lead, 'id' | 'stage'>, to: LeadStage, patch: Partial<Lead> = {}, eventData: object = {}) {
  assertTransition(lead.stage, to);
  await updateLead(db, lead.id, { ...patch, stage: to });
  await logEvent(db, lead.id, `etapa_${to}`, eventData);
}

/** Insere os novos e atualiza os que já existem, sem mexer no andamento deles. */
export async function importLeads(db: Db, leads: NewLead[]): Promise<{ inserted: number; updated: number }> {
  const unique = dedupeLeads(leads);
  if (!unique.length) return { inserted: 0, updated: 0 };
  const { data, error } = await db.from('leads').select().in('place_id', unique.map((l) => l.place_id));
  if (error) throw new Error(error.message);
  const existing = new Map((data as Lead[]).map((l) => [l.place_id, l]));

  let updated = 0;
  const fresh = [];
  for (const lead of unique) {
    const current = existing.get(lead.place_id);
    if (current) {
      await updateLead(db, current.id, mergeLeadOnReimport(current, lead));
      updated += 1;
    } else {
      fresh.push({ ...lead, instagram_url: classifyLink(lead.website_url).instagramUrl });
    }
  }
  if (fresh.length) {
    const { error: insertError } = await db.from('leads').insert(fresh);
    if (insertError) throw new Error(insertError.message);
    for (const lead of fresh) await logEvent(db, await idOf(db, lead.place_id), 'encontrado', { batch_id: lead.batch_id });
  }
  return { inserted: fresh.length, updated };
}

async function idOf(db: Db, placeId: string): Promise<string> {
  const { data } = await db.from('leads').select('id').eq('place_id', placeId).single();
  return (data as { id: string }).id;
}

export async function listEvents(db: Db, leadId: string): Promise<{ id: string; created_at: string; type: string; data: Record<string, unknown> }[]> {
  const { data } = await db.from('events').select().eq('lead_id', leadId).order('created_at', { ascending: false });
  return data ?? [];
}

export async function lastEventOf(db: Db, leadIds: string[], type: string): Promise<Map<string, { created_at: string; data: Record<string, unknown> }>> {
  if (!leadIds.length) return new Map();
  const { data } = await db.from('events').select('lead_id, created_at, data').eq('type', type).in('lead_id', leadIds).order('created_at', { ascending: true });
  return new Map((data ?? []).map((e) => [e.lead_id as string, e]));
}
