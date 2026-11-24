'use server';

import { addToDoNotContact, createLead, enqueueJob, getLead, INSTAGRAM_MEDIA_JOB, NO_BATCH, removeLeadFromBatch, saveLeadField, saveLeadNote, setLeadBatch, moveLead } from '@lps/db';
import { type LeadField, type NewLeadInput } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APIFY_NOT_CONNECTED, buildInstagramInput, workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from './auth';

const id = (form: FormData) => String(form.get('leadId'));

export async function discardLeadAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, id(form));
  if (lead) await moveLead(db, lead, 'descartado', { exit_reason: 'Descartado por você' });
  revalidatePath('/painel', 'layout');
}

export async function blockLeadAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, id(form));
  if (!lead) return;
  const reason = String(form.get('reason') ?? 'Marcado como não contatar');
  await addToDoNotContact(db, { phone_e164: lead.phone_e164, place_id: lead.place_id, instagram_url: lead.instagram_url, reason });
  await moveLead(db, lead, 'nao_contatar', { exit_reason: reason });
  revalidatePath('/painel', 'layout');
}

export async function saveNotesAction(leadId: string, patch: { comment?: string; reason?: string }) {
  const db = await authedDb();
  const { user } = await getSession();
  if (patch.comment !== undefined) await saveLeadNote(db, leadId, 'comment', patch.comment, user.id);
  if (patch.reason !== undefined) await saveLeadNote(db, leadId, 'reason', patch.reason, user.id);
  revalidatePath(`/painel/leads/${leadId}`);
}

/** Lê o perfil do Instagram no Apify (gasta crédito do workspace): imagens, último post e contatos que faltavam. */
export async function analyzeInstagramAction(leadId: string): Promise<{ error?: string }> {
  const { workspace } = await getSession();
  const db = await authedDb();
  const lead = await getLead(db, leadId);
  if (!lead?.instagram_url) return { error: 'Este lead não tem Instagram.' };
  if (!buildInstagramInput([lead.instagram_url]).usernames.length) return { error: 'O link do Instagram não é de um perfil.' };
  if (!(await workspaceHasApify(workspace.id))) return { error: APIFY_NOT_CONNECTED };
  await enqueueJob(db, { type: INSTAGRAM_MEDIA_JOB, payload: { lead_id: leadId, refresh: '1' }, dedupeKey: `${INSTAGRAM_MEDIA_JOB}:${leadId}` });
  revalidatePath(`/painel/leads/${leadId}`);
  return {};
}

const FIELDS: LeadField[] = ['name', 'business_type', 'phone', 'email', 'city', 'address', 'instagram_url', 'website_url', 'maps_url', 'description'];

/** Novo lead: abre a ficha dele. Se o negócio já existia, abre a que já existe. */
export async function createLeadAction(form: FormData): Promise<{ error: string }> {
  const { user } = await getSession();
  const input = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) ?? '')])) as NewLeadInput;
  const batch = String(form.get('batch') ?? NO_BATCH);
  const out = await createLead(await authedDb(), input, { batchId: batch === NO_BATCH || !batch ? null : batch, by: user.id });
  if ('error' in out) return out;
  revalidatePath('/painel', 'layout');
  redirect(`/painel/leads/${out.id}${out.known ? '?aviso=existente' : ''}`);
}

export async function saveLeadFieldsAction(leadId: string, field: LeadField, value: string): Promise<{ error?: string }> {
  if (!FIELDS.includes(field)) return { error: 'Campo inválido.' };
  const { user } = await getSession();
  const out = await saveLeadField(await authedDb(), leadId, field, value, user.id);
  if (!out.error) revalidatePath('/painel', 'layout');
  return out;
}

export async function setLeadBatchAction(leadId: string, batchId: string): Promise<{ error?: string }> {
  const { user } = await getSession();
  const out = await setLeadBatch(await authedDb(), leadId, batchId === NO_BATCH ? null : batchId, user.id);
  revalidatePath('/painel', 'layout');
  return out;
}

export async function removeLeadFromBatchAction(leadId: string, batchId: string): Promise<{ error?: string }> {
  const { user } = await getSession();
  const out = await removeLeadFromBatch(await authedDb(), leadId, batchId, user.id);
  revalidatePath('/painel', 'layout');
  return out;
}
