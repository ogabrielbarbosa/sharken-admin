'use server';

import { getEnv } from '@lps/config';
import {
  createContact,
  findContactByPhone,
  getContact,
  getLead,
  INVALID_NUMBER_MESSAGE,
  listMessages,
  logEvent,
  retryMessage,
  sendMessage,
  setContactStatus,
  updateContact,
  updateLead,
} from '@lps/db';
import { renewExpiry, toMobileE164, type ContactStatus } from '@lps/domain';
import { getWhatsAppProvider, suggestConversationReply } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { authedDb } from '@/lib/auth';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const STATUSES: ContactStatus[] = ['novo', 'contatado', 'follow_up', 'em_conversa', 'fechado', 'perdido', 'nao_contatar'];
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.' });
const refresh = () => revalidatePath('/painel/crm');
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function guarded<T>(fn: () => Promise<T>): Promise<Result<T extends object ? T : object>> {
  try {
    const out = await fn();
    refresh();
    return { ok: true, ...((out ?? {}) as object) } as Result<T extends object ? T : object>;
  } catch (err) {
    unstable_rethrow(err); // redirect do authedDb
    refresh(); // o balão com erro precisa aparecer
    return fail(err);
  }
}

/** Um clique, um contato. O erro volta como texto para a tela mostrar. */
export async function sendMessageAction(contactId: string, body: string, clientMessageId: string) {
  return guarded(async () => {
    if (!contactId || !text(body) || !clientMessageId) throw new Error('Escreva a mensagem antes de enviar.');
    const db = await authedDb();
    const message = await sendMessage(db, getWhatsAppProvider(), { contactId, text: body, clientMessageId }, new Date(), { pageTtlHours: getEnv().PAGE_TTL_HOURS });
    return { messageId: message.id };
  });
}

export async function retryMessageAction(messageId: string, clientMessageId: string) {
  return guarded(async () => {
    if (!messageId || !clientMessageId) throw new Error('Mensagem não encontrada.');
    const db = await authedDb();
    const message = await retryMessage(db, getWhatsAppProvider(), messageId, clientMessageId, new Date(), { pageTtlHours: getEnv().PAGE_TTL_HOURS });
    return { messageId: message.id };
  });
}

export async function setStatusAction(contactId: string, to: string) {
  return guarded(async () => {
    if (!STATUSES.includes(to as ContactStatus)) throw new Error('Status inválido.');
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) throw new Error('Contato não encontrado.');
    await setContactStatus(db, contact, to as ContactStatus);
  });
}

/** Data e anotação do follow-up, ou `null` na data para remover. */
export async function saveFollowUpAction(contactId: string, date: string | null, note: string | null) {
  return guarded(async () => {
    const db = await authedDb();
    if (!(await getContact(db, contactId))) throw new Error('Contato não encontrado.');
    if (!date) {
      await updateContact(db, contactId, { follow_up_at: null, follow_up_note: null });
      return;
    }
    const at = new Date(date);
    if (Number.isNaN(at.getTime())) throw new Error('Data do follow-up inválida.');
    await updateContact(db, contactId, { follow_up_at: at.toISOString(), follow_up_note: text(note) || null });
  });
}

async function siteOf(db: Awaited<ReturnType<typeof authedDb>>, contactId: string) {
  const contact = await getContact(db, contactId);
  if (!contact?.lead_id) throw new Error('Este contato não tem página.');
  return contact.lead_id;
}

export async function renewPageAction(contactId: string) {
  return guarded(async () => {
    const db = await authedDb();
    const leadId = await siteOf(db, contactId);
    const { data, error } = await db
      .from('sites')
      .update({ expires_at: renewExpiry(new Date(), getEnv().PAGE_TTL_HOURS).toISOString() })
      .eq('lead_id', leadId)
      .eq('status', 'modelo')
      .select('lead_id');
    if (error) throw new Error(error.message);
    if (!(data as unknown[] | null)?.length) throw new Error('Não há página ativa para renovar.');
  });
}

export async function removePageAction(contactId: string) {
  return guarded(async () => {
    const db = await authedDb();
    const leadId = await siteOf(db, contactId);
    const { error } = await db.from('sites').update({ status: 'removido' }).eq('lead_id', leadId);
    if (error) throw new Error(error.message);
    await logEvent(db, leadId, 'modelo_removido');
  });
}

export async function markInvalidNumberAction(contactId: string) {
  return guarded(async () => {
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) throw new Error('Contato não encontrado.');
    if (contact.status === 'perdido') return; // já está perdido
    await setContactStatus(db, contact, 'perdido', { motivo: INVALID_NUMBER_MESSAGE });
    if (contact.lead_id) await updateLead(db, contact.lead_id, { exit_reason: INVALID_NUMBER_MESSAGE });
  });
}

/** Só devolve o texto para o campo. Nunca envia. */
export async function suggestReplyAction(contactId: string): Promise<{ text?: string; error?: string }> {
  try {
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) return { error: 'Contato não encontrado.' };
    const lead = contact.lead_id ? await getLead(db, contact.lead_id) : null;
    const messages = await listMessages(db, contactId, 20);
    if (!messages.some((m) => m.direction === 'entrada')) return { error: 'Ainda não há mensagem recebida para responder.' };
    return { text: await suggestConversationReply(lead, contact.name, messages) };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : 'Não foi possível sugerir a resposta.' };
  }
}

/** Contato manual: nome e celular. Rejeita número repetido, com ou sem o nono dígito. */
export async function createContactAction(name: string, phone: string): Promise<Result<{ contactId: string }>> {
  try {
    const cleanName = text(name);
    if (!cleanName) throw new Error('Informe o nome.');
    const mobile = toMobileE164(phone);
    if (!mobile) throw new Error('Informe um celular válido, com DDD.');
    const db = await authedDb();
    const other = await findContactByPhone(db, mobile);
    if (other) throw new Error(`Este número já é do contato ${other.name}.`);
    const created = await createContact(db, { name: cleanName, phone_e164: mobile, origin: 'manual', status: 'novo' });
    refresh();
    return { ok: true, contactId: created.id };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err);
  }
}
