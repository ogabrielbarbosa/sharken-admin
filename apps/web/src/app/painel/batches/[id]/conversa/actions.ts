'use server';

import { getLead, logEvent, moveLead } from '@lps/db';
import { suggestReply } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';

export async function suggestReplyAction(leadId: string, incoming: string): Promise<{ text?: string; error?: string }> {
  const db = await authedDb();
  const lead = await getLead(db, leadId);
  if (!lead || !incoming.trim()) return { error: 'Cole a mensagem recebida.' };
  await logEvent(db, leadId, 'mensagem_recebida', { text: incoming });
  try {
    return { text: await suggestReply(lead, incoming) };
  } catch (err) {
    return { error: (err as Error).message };
  } finally {
    revalidatePath('/painel', 'layout');
  }
}

export async function markSoldAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await moveLead(db, lead, 'vendido', { sold_at: new Date().toISOString() });
  revalidatePath('/painel', 'layout');
  redirect(`/painel/batches/${lead.batch_id}/vendido`);
}

export async function markNoInterestAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await moveLead(db, lead, 'sem_interesse');
  revalidatePath('/painel', 'layout');
}

