import { batchCountry, batchName, editLeadField, instagramHandle, newLeadFromInput, type Batch, type Lead, type LeadChange, type LeadField, type NewLeadInput } from '@lps/domain';
import { getBatch } from './batches';
import type { Db } from './client';
import { enqueueJob } from './jobs';
import { getLead, importLeads, logEvent, updateLead } from './leads';

export const REFRESH_LEAD_JOB = 'refresh_lead';
export const LEAD_GONE = 'Lead não encontrado.';
type Result = { error?: string };

const logChange = (db: Db, leadId: string, change: LeadChange, by: string | null) => logEvent(db, leadId, 'dados_editados', { ...change, por: by });

/**
 * Cria um lead digitado (sem batch, ou num batch) e manda para a análise: o worker lê o Google e o site.
 * O Instagram só é guardado; ele é lido quando o lead vira Qualificado ou pelo botão da ficha.
 */
export async function createLead(db: Db, input: NewLeadInput, opts: { batchId: string | null; by: string }): Promise<{ id: string; known: boolean } | { error: string }> {
  const parsed = newLeadFromInput(input);
  if ('error' in parsed) return parsed;
  if (opts.batchId && !(await getBatch(db, opts.batchId))) return { error: 'Batch não encontrado.' };
  const { row, provisional } = parsed;
  const { inserted, ids } = await importLeads(db, [{
    ...row, batch_id: opts.batchId, place_id: null, is_open: true, rating: null, reviews_count: 0, images_count: 0, categories: [], photos: [], reviews: [],
  }], { por: opts.by });
  const id = ids[0]!;
  if (!inserted) {
    // Já existia: guarda o link do Google que faltava, sem refazer a análise.
    const lead = (await getLead(db, id))!;
    if (row.maps_url && !lead.maps_url && !lead.place_id) await saveLeadField(db, id, 'maps_url', row.maps_url, opts.by);
    return { id, known: true };
  }
  await enqueueJob(db, {
    type: 'analyze_lead',
    payload: { lead_id: id, manual: '1', ...(provisional ? { provisional: '1' } : {}) },
    dedupeKey: `analyze_lead:${id}`,
  });
  return { id, known: false };
}

/** Edita um campo da ficha, registra no histórico e, se for o link do Google ou o site, manda ler de novo. */
export async function saveLeadField(db: Db, leadId: string, field: LeadField, raw: string, by: string): Promise<Result> {
  const lead = await getLead(db, leadId);
  if (!lead) return { error: LEAD_GONE };
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  const edit = editLeadField(lead, field, raw, batch ? batchCountry(batch) : 'BR');
  if (!edit) return {};
  if ('error' in edit) return edit;
  if (field === 'instagram_url' && edit.patch.instagram_url) {
    const { data, error } = await db.from('leads').select('id, name').eq('instagram_handle', instagramHandle(edit.patch.instagram_url)).neq('id', leadId).limit(1);
    if (error) throw new Error(error.message);
    const other = (data as { name: string }[])[0];
    if (other) return { error: `Esse Instagram já é do lead ${other.name}.` };
  }
  // Site novo: a situação antiga não vale mais; o worker confere de novo. Sem site, já fica decidido.
  const reset: Partial<Lead> = field === 'website_url'
    ? { site_checks: [], site_signals: null, site_data: null, enrichment: null, ...(edit.patch.website_url ? { site_status: null } : { site_status: 'sem_link', flow: 'sem_site' }) }
    : {};
  await updateLead(db, leadId, { ...edit.patch, ...reset });
  await logChange(db, leadId, edit.change, by);
  // Em análise, o próprio worker lê os links; depois disso, uma releitura que não muda a etapa.
  if ((field === 'maps_url' || field === 'website_url') && edit.change.para && lead.stage !== 'analisando') await refreshLead(db, leadId, field === 'maps_url' ? 'maps' : 'site');
  return {};
}

/** Lê de novo o Google ou o site do lead, sem mudar a etapa. */
export const refreshLead = (db: Db, leadId: string, part: 'maps' | 'site') =>
  enqueueJob(db, { type: REFRESH_LEAD_JOB, payload: { lead_id: leadId, part } });

/** Comentário interno e motivo, com histórico. */
export async function saveLeadNote(db: Db, leadId: string, field: 'comment' | 'reason', value: string, by: string | null): Promise<void> {
  const lead = await getLead(db, leadId);
  if (!lead) return;
  const de = lead[field]?.trim() || null;
  const para = value.trim() || null;
  if (de === para) return;
  await updateLead(db, leadId, { [field]: value });
  await logChange(db, leadId, { campo: field, de, para }, by);
}

/**
 * Passa o lead para outro batch (ou para nenhum), na mesma etapa. Só troca o batch de origem: se outro batch também
 * encontrou o lead, essa ligação fica.
 */
export async function setLeadBatch(db: Db, leadId: string, batchId: string | null, by: string): Promise<Result> {
  const lead = await getLead(db, leadId);
  if (!lead) return { error: LEAD_GONE };
  if (lead.batch_id === batchId) return {};
  const [from, to] = await Promise.all([lead.batch_id ? getBatch(db, lead.batch_id) : null, batchId ? getBatch(db, batchId) : null]);
  if (batchId && !to) return { error: 'Batch não encontrado.' };
  if (to) {
    const { error } = await db.from('batch_leads').upsert({ batch_id: to.id, lead_id: leadId, already_known: false }, { onConflict: 'batch_id,lead_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await updateLead(db, leadId, { batch_id: batchId });
  if (lead.batch_id) await unlinkBatch(db, leadId, lead.batch_id, batchId);
  const label = (b: Batch | null) => (b ? batchName(b) : null);
  await logChange(db, leadId, { campo: 'batch', de: label(from), para: label(to) }, by);
  return {};
}

/** Tira o lead de um batch em que ele também foi encontrado (não o de origem). */
export async function removeLeadFromBatch(db: Db, leadId: string, batchId: string, by: string): Promise<Result> {
  const lead = await getLead(db, leadId);
  if (!lead) return { error: LEAD_GONE };
  if (lead.batch_id === batchId) return setLeadBatch(db, leadId, null, by);
  const batch = await getBatch(db, batchId);
  await unlinkBatch(db, leadId, batchId, lead.batch_id);
  await logChange(db, leadId, { campo: 'batch', de: batch ? batchName(batch) : null, para: null }, by);
  return {};
}

async function unlinkBatch(db: Db, leadId: string, batchId: string, next: string | null) {
  const { error } = await db.from('batch_leads').delete().eq('lead_id', leadId).eq('batch_id', batchId);
  if (error) throw new Error(error.message);
  // As conversas do lead acompanham o batch dele.
  const res = await db.from('contacts').update({ batch_id: next }).eq('lead_id', leadId).eq('batch_id', batchId);
  if (res.error) throw new Error(res.error.message);
}

/** Batches em que o lead aparece. */
export async function batchIdsOfLead(db: Db, leadId: string): Promise<string[]> {
  const { data, error } = await db.from('batch_leads').select('batch_id').eq('lead_id', leadId);
  if (error) throw new Error(error.message);
  return (data as { batch_id: string }[]).map((r) => r.batch_id);
}

