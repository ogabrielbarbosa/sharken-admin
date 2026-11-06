'use server';

import { addToDoNotContact, getLead, moveLead, updateLead } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { authedDb } from './auth';

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
  await addToDoNotContact(db, { phone_e164: lead.phone_e164, place_id: lead.place_id, reason });
  await moveLead(db, lead, 'nao_contatar', { exit_reason: reason });
  revalidatePath('/painel', 'layout');
}

export async function saveNotesAction(leadId: string, patch: { comment?: string; reason?: string }) {
  const db = await authedDb();
  await updateLead(db, leadId, patch);
}
