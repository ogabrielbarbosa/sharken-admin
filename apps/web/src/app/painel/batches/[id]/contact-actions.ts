'use server';

import { addToDoNotContact, getContactContext, getLead, logEvent, moveLead, updateLead } from '@lps/db';
import { blockEntry, canContact, type ContactKind } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { authedDb } from '@/lib/auth';

const refresh = () => revalidatePath('/painel', 'layout');

async function loadChecked(leadId: string, kind: ContactKind) {
  const db = await authedDb();
  const lead = await getLead(db, leadId);
  if (!lead) return { error: 'Lead não encontrado.' } as const;
  const ctx = await getContactContext(db, lead);
  const check = canContact(lead, { ...ctx, now: new Date() }, kind);
  if (!check.allowed) return { error: check.reason ?? 'Contato não permitido.' } as const;
  return { db, lead } as const;
}

/** Registra que a conversa foi aberta. O envio só é registrado na confirmação. */
export async function recordOpenedAction(leadId: string, kind: ContactKind): Promise<{ error?: string }> {
  const out = await loadChecked(leadId, kind);
  if ('error' in out) return { error: out.error };
  await logEvent(out.db, leadId, 'conversa_aberta', { kind });
  return {};
}

export async function confirmSentAction(leadId: string, kind: ContactKind, text: string): Promise<{ error?: string }> {
  const out = await loadChecked(leadId, kind);
  if ('error' in out) return { error: out.error };
  const { db, lead } = out;
  const now = new Date().toISOString();
  if (kind === 'first') {
    await updateLead(db, lead.id, { contacted_at: now });
    await logEvent(db, leadId, 'contato_enviado', { text });
  } else {
    await updateLead(db, lead.id, { follow_up_at: now });
    await logEvent(db, leadId, 'follow_up_enviado', { text });
  }
  refresh();
  return {};
}

export async function invalidNumberAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await moveLead(db, lead, 'descartado', { exit_reason: 'Número inválido' });
  await logEvent(db, lead.id, 'numero_invalido');
  refresh();
}

export async function askedToStopAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await addToDoNotContact(db, blockEntry(lead, 'Pediu para parar'));
  await moveLead(db, lead, 'nao_contatar', { exit_reason: 'Pediu para parar' });
  await logEvent(db, lead.id, 'pediu_para_parar');
  refresh();
}

export async function respondedAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await updateLead(db, lead.id, { responded_at: new Date().toISOString() });
  refresh();
}
