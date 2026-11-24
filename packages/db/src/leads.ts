import { assertTransition, classifyLink, dedupeLeads, findMatch, keysOf, mergeIncoming, sharedPhonesOf, type Lead, type LeadStage, type NewLead } from '@lps/domain';
import type { Db } from './client';
import { fetchAll } from './fetch-all';
import { enqueueJob } from './jobs';

export async function getLead(db: Db, id: string): Promise<Lead | null> {
  const { data } = await db.from('leads').select().eq('id', id).maybeSingle();
  return data as Lead | null;
}

/** Ids em lotes, para não estourar o tamanho da URL do PostgREST. */
const CHUNK = 150;
const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/** Leads pelos ids, em lotes. */
export async function getLeadsByIds(db: Db, ids: string[]): Promise<Lead[]> {
  const out: Lead[] = [];
  for (const part of chunks([...new Set(ids)])) {
    const { data, error } = await db.from('leads').select().in('id', part);
    if (error) throw new Error(error.message);
    out.push(...(data as Lead[]));
  }
  return out;
}

/** "Leads sem batch": a linha fixa de Batches, com quadro próprio. */
export const NO_BATCH = 'sem';

/** Leads que não estão em nenhum batch, com a etapa de cada um. */
export function listNoBatchStages(db: Db): Promise<{ id: string; stage: LeadStage }[]> {
  return fetchAll((from, to) => db.from('leads').select('id, stage, found:batch_leads(batch_id)').is('found', null).order('id').range(from, to)) as unknown as Promise<{ id: string; stage: LeadStage }[]>;
}

/** Ids dos leads que o batch encontrou (os novos e os que já eram conhecidos). */
export async function batchLeadIds(db: Db, batchId: string): Promise<string[]> {
  if (batchId === NO_BATCH) return (await listNoBatchStages(db)).map((l) => l.id);
  const rows = await fetchAll<{ lead_id: string }>((from, to) => db.from('batch_leads').select('lead_id').eq('batch_id', batchId).order('lead_id').range(from, to));
  return rows.map((r) => r.lead_id);
}

/**
 * Leads do batch, na etapa em que cada um está (um lead já conhecido aparece aqui na etapa que tem nos outros).
 * Por padrão ordena pela pontuação; `stage_changed_at` põe primeiro quem está há mais tempo na etapa.
 */
export async function listLeads(db: Db, batchId: string, stages?: LeadStage[], orderBy: 'score' | 'stage_changed_at' = 'score'): Promise<Lead[]> {
  const leads = (await getLeadsByIds(db, await batchLeadIds(db, batchId))).filter((l) => !stages || stages.includes(l.stage));
  return orderBy === 'stage_changed_at'
    ? leads.sort((a, b) => new Date(a.stage_changed_at).getTime() - new Date(b.stage_changed_at).getTime())
    : leads.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** Place IDs que já estão no banco, para gravar só os negócios novos durante a busca. */
export async function listKnownPlaceIds(db: Db, placeIds: string[]): Promise<Set<string>> {
  if (!placeIds.length) return new Set();
  const { data, error } = await db.from('leads').select('place_id').in('place_id', placeIds);
  if (error) throw new Error(error.message);
  return new Set((data as { place_id: string }[]).map((l) => l.place_id));
}

/** Etapa de cada lead em cada batch em que ele apareceu. */
export async function listBatchStages(db: Db): Promise<{ batch_id: string; stage: LeadStage }[]> {
  const [links, leads] = await Promise.all([
    fetchAll<{ batch_id: string; lead_id: string }>((from, to) => db.from('batch_leads').select('batch_id, lead_id').order('batch_id').order('lead_id').range(from, to)),
    fetchAll<{ id: string; stage: LeadStage }>((from, to) => db.from('leads').select('id, stage').order('id').range(from, to)),
  ]);
  const stageOf = new Map(leads.map((l) => [l.id, l.stage]));
  return links.flatMap((l) => (stageOf.has(l.lead_id) ? [{ batch_id: l.batch_id, stage: stageOf.get(l.lead_id)! }] : []));
}

export type KnownFrom = { id: string; name?: string | null; location: string; business_type: string };

/** Leads deste batch que já eram conhecidos, com os outros batches em que aparecem. */
export async function listKnownLeads(db: Db, batchId: string): Promise<Record<string, KnownFrom[]>> {
  const { data, error } = await db.from('batch_leads').select('lead_id').eq('batch_id', batchId).eq('already_known', true);
  if (error) throw new Error(error.message);
  const ids = (data as { lead_id: string }[]).map((r) => r.lead_id);
  if (!ids.length) return {};
  const others: { batch_id: string; lead_id: string }[] = [];
  for (const part of chunks(ids)) {
    const res = await db.from('batch_leads').select('batch_id, lead_id').in('lead_id', part);
    if (res.error) throw new Error(res.error.message);
    others.push(...(res.data as { batch_id: string; lead_id: string }[]).filter((r) => r.batch_id !== batchId));
  }
  const batchIds = [...new Set(others.map((o) => o.batch_id))];
  const { data: batches } = batchIds.length ? await db.from('batches').select('id, name, location, business_type').in('id', batchIds) : { data: [] };
  const byId = new Map(((batches ?? []) as KnownFrom[]).map((b) => [b.id, b]));
  const out: Record<string, KnownFrom[]> = {};
  for (const id of ids) out[id] = others.filter((o) => o.lead_id === id).flatMap((o) => (byId.has(o.batch_id) ? [byId.get(o.batch_id)!] : []));
  return out;
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
  // Qualificado: o worker salva no R2 a foto de perfil e os posts do Instagram (pula quem não tem ou já salvou).
  if (to === 'completar') await enqueueJob(db, { type: INSTAGRAM_MEDIA_JOB, payload: { lead_id: lead.id }, dedupeKey: `${INSTAGRAM_MEDIA_JOB}:${lead.id}` });
}

export const INSTAGRAM_MEDIA_JOB = 'instagram_media';

/** Leads do workspace que podem ser o mesmo negócio de algum dos que chegaram (mesma chave forte). */
async function matchCandidates(db: Db, leads: NewLead[]): Promise<Lead[]> {
  const keys = leads.map(keysOf);
  const pool = new Map<string, Lead>();
  const columns = ['place_id', 'instagram_handle', 'site_domain', 'phone_e164'] as const;
  for (const column of columns) {
    const values = [...new Set(keys.map((k) => k[column]).filter((v): v is string => !!v))];
    for (const part of chunks(values)) {
      const { data, error } = await db.from('leads').select().in(column, part);
      if (error) throw new Error(error.message);
      for (const l of data as Lead[]) pool.set(l.id, l);
    }
  }
  return [...pool.values()];
}

const withKeys = (l: Lead) => ({ ...l, ...keysOf(l) });

/**
 * Grava o que uma busca achou, cruzando com os leads do workspace por place_id, @ do Instagram, domínio e telefone.
 * Quem já existe ganha o que faltava (sem mudar de etapa) e passa a aparecer também neste batch, como já conhecido.
 */
export async function importLeads(db: Db, leads: NewLead[], event: object = {}): Promise<{ inserted: number; updated: number; known: number; ids: string[] }> {
  const unique = dedupeLeads(leads);
  if (!unique.length) return { inserted: 0, updated: 0, known: 0, ids: [] };
  const ids: string[] = [];
  const pool = (await matchCandidates(db, unique)).map(withKeys);
  const shared = sharedPhonesOf(pool);
  const createdNow = new Set<string>();

  let inserted = 0;
  let updated = 0;
  let known = 0;
  const links: { batch_id: string; lead_id: string; already_known: boolean }[] = [];
  for (const lead of unique) {
    const current = findMatch(keysOf(lead), pool, shared);
    if (current) {
      const patch = mergeIncoming(current, lead);
      if (Object.keys(patch).length) await updateLead(db, current.id, patch);
      Object.assign(current, patch, keysOf({ ...current, ...patch }));
      updated += 1;
      ids.push(current.id);
      if (!lead.batch_id) continue;
      const alreadyKnown = !createdNow.has(current.id) && current.batch_id !== lead.batch_id;
      if (alreadyKnown) {
        known += 1;
        await logEvent(db, current.id, 'reencontrado', { batch_id: lead.batch_id });
      }
      links.push({ batch_id: lead.batch_id, lead_id: current.id, already_known: alreadyKnown });
      continue;
    }
    const row = { ...lead, instagram_url: lead.instagram_url ?? classifyLink(lead.website_url).instagramUrl };
    const { data, error } = await db.from('leads').insert(row).select().single();
    if (error) throw new Error(error.message);
    const created = data as Lead;
    createdNow.add(created.id);
    pool.push(withKeys(created));
    inserted += 1;
    ids.push(created.id);
    await logEvent(db, created.id, lead.batch_id ? 'encontrado' : 'cadastrado', { ...event, batch_id: lead.batch_id });
    if (lead.batch_id) links.push({ batch_id: lead.batch_id, lead_id: created.id, already_known: false });
  }
  await linkLeadsToBatch(db, links);
  return { inserted, updated, known, ids };
}

/** Lead cadastrado à mão: grava (ou liga ao batch, se já existe) e põe na fila da análise. */
export async function addManualLead(db: Db, lead: NewLead & { batch_id: string }): Promise<{ known: boolean }> {
  const { inserted } = await importLeads(db, [lead]);
  const waiting = await listLeads(db, lead.batch_id, ['analisando']);
  if (waiting.length) {
    // Antes de enfileirar: o worker passa o batch para concluído quando a fila dele acaba.
    const { error } = await db.from('batches').update({ status: 'analisando' }).eq('id', lead.batch_id);
    if (error) throw new Error(error.message);
  }
  for (const l of waiting) {
    await enqueueJob(db, { type: 'analyze_lead', payload: { lead_id: l.id, batch_id: lead.batch_id }, dedupeKey: `analyze_lead:${l.id}` });
  }
  return { known: inserted === 0 };
}

/** Leads que já existem e que uma busca deste batch achou de novo (pelo @, sem ler o perfil outra vez). */
export async function linkExistingLeads(db: Db, batchId: string, leads: Pick<Lead, 'id' | 'batch_id'>[]) {
  const links = leads.map((l) => ({ batch_id: batchId, lead_id: l.id, already_known: l.batch_id !== batchId }));
  await linkLeadsToBatch(db, links);
  for (const l of leads) if (l.batch_id !== batchId) await logEvent(db, l.id, 'reencontrado', { batch_id: batchId });
}

/** Leads do workspace com estes @ do Instagram. */
export async function leadsByInstagramHandles(db: Db, handles: string[]): Promise<Lead[]> {
  const out: Lead[] = [];
  for (const part of chunks([...new Set(handles)])) {
    const { data, error } = await db.from('leads').select().in('instagram_handle', part);
    if (error) throw new Error(error.message);
    out.push(...(data as Lead[]));
  }
  return out;
}

/** Registra em quais batches cada lead apareceu. Repetir não muda nada (fica a primeira vez). */
async function linkLeadsToBatch(db: Db, links: { batch_id: string; lead_id: string; already_known: boolean }[]) {
  if (!links.length) return;
  const { error } = await db.from('batch_leads').upsert(links, { onConflict: 'batch_id,lead_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
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
