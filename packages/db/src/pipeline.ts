import { canCompleteInfo, normalizeLinkUrl, parseLoomUrl, parsePageUrl, type Lead } from '@lps/domain';
import type { Db } from './client';
import { createContactFromLead, NO_PHONE_MESSAGE } from './contacts';
import { getLead, moveLead, updateLead } from './leads';
import { listAssets } from './lead-assets';

export type PipelineResult = { ok: true; warning?: string } | { ok: false; error: string };

export const STALE = 'Este lead já mudou de etapa.';
export const INVALID_LINK = 'Esse link não parece válido.';
export const NOT_LOOM = 'Use um link do Loom (loom.com/share/…).';
export const OTHER_LEAD_CONTACT = 'Este telefone já é contato de outro lead: os links mostrados no CRM são os dele.';

const stale = (): PipelineResult => ({ ok: false, error: STALE });

/** Revisar → Completar para os leads escolhidos; quem não está em Revisar fica como está. */
export async function qualifyLeads(db: Db, leadIds: string[]): Promise<{ moved: number }> {
  if (!leadIds.length) return { moved: 0 };
  const { data, error } = await db.from('leads').select().in('id', leadIds).eq('stage', 'revisar');
  if (error) throw new Error(error.message);
  const leads = data as Lead[];
  for (const lead of leads) await moveLead(db, lead, 'completar');
  return { moved: leads.length };
}

export async function completeInfo(db: Db, leadId: string): Promise<PipelineResult> {
  const lead = await getLead(db, leadId);
  if (!lead || lead.stage !== 'completar') return stale();
  const check = canCompleteInfo(lead, await listAssets(db, leadId));
  if (!check.ok) return { ok: false, error: check.reason };
  await moveLead(db, lead, 'pagina');
  return { ok: true };
}

export async function savePageUrl(db: Db, leadId: string, raw: string): Promise<PipelineResult> {
  const lead = await getLead(db, leadId);
  if (!lead || !['pagina', 'video', 'crm'].includes(lead.stage)) return stale();
  const url = parsePageUrl(raw);
  if (!url) return { ok: false, error: INVALID_LINK };
  if (lead.stage === 'pagina') await moveLead(db, lead, 'video', { page_url: url });
  else await updateLead(db, leadId, { page_url: url });
  return { ok: true };
}

export async function saveLoomUrl(db: Db, leadId: string, raw: string): Promise<PipelineResult> {
  const lead = await getLead(db, leadId);
  if (!lead || !['video', 'crm'].includes(lead.stage)) return stale();
  const url = parseLoomUrl(raw);
  if (!url) return { ok: false, error: normalizeLinkUrl(raw) ? NOT_LOOM : INVALID_LINK };
  // O link é gravado antes do contato, para não se perder se a criação falhar.
  await updateLead(db, leadId, { loom_url: url });
  if (lead.stage === 'crm') return { ok: true };

  if (!lead.phone_e164) return { ok: false, error: NO_PHONE_MESSAGE };
  const contact = await createContactFromLead(db, { ...lead, loom_url: url });
  await moveLead(db, lead, 'crm', {}, { contact_id: contact.id });
  return contact.lead_id && contact.lead_id !== lead.id ? { ok: true, warning: OTHER_LEAD_CONTACT } : { ok: true };
}

export async function stepBack(db: Db, leadId: string, from: 'pagina' | 'video'): Promise<PipelineResult> {
  const lead = await getLead(db, leadId);
  if (!lead || lead.stage !== from) return stale();
  await moveLead(db, lead, from === 'video' ? 'pagina' : 'completar');
  return { ok: true };
}
