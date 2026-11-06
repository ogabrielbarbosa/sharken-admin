'use server';

import { getLead, logEvent, moveLead } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { authedDb } from '@/lib/auth';

export async function removeModelAction(form: FormData) {
  const db = await authedDb();
  const leadId = String(form.get('leadId'));
  await db.from('sites').update({ status: 'removido' }).eq('lead_id', leadId);
  await logEvent(db, leadId, 'modelo_removido');
  revalidatePath(`/painel/leads/${leadId}`);
}

export async function respondedFromLeadAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await moveLead(db, lead, 'conversa', { responded_at: new Date().toISOString() });
  revalidatePath('/painel', 'layout');
}
