import {
  expiryAfterSend,
  followUpDueAt,
  phoneMatchCandidates,
  sendBlockReason,
  sendKind,
  statusAfterSend,
  type Contact,
  type Message,
  type WhatsAppProvider,
} from '@lps/domain';
import type { Db } from './client';
import { getContact, updateContact } from './contacts';
import { insertMessage } from './messages';

export const INVALID_NUMBER_MESSAGE = 'Número sem WhatsApp';
export const DEFAULT_PAGE_TTL_HOURS = 24;

/** Variantes do número com e sem o "+": os contatos antigos foram gravados sem ele. */
export function phoneLookupValues(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  return [...new Set([...phoneMatchCandidates(`+${digits}`), ...phoneMatchCandidates(digits)])];
}

export async function isDoNotContact(db: Db, phoneE164: string): Promise<boolean> {
  const { data, error } = await db.from('do_not_contact').select('phone_e164').in('phone_e164', phoneLookupValues(phoneE164)).limit(1);
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** Só 'desconectado' bloqueia. Sem linha, o estado é desconhecido e o provedor responde por si. */
export async function isWhatsAppConnected(db: Db): Promise<boolean> {
  const { data, error } = await db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { state: string } | null)?.state !== 'desconectado';
}

async function findByClientId(db: Db, clientMessageId: string): Promise<Message | null> {
  const { data, error } = await db.from('messages').select().eq('client_message_id', clientMessageId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Message | null;
}

async function getMessage(db: Db, id: string): Promise<Message> {
  const { data, error } = await db.from('messages').select().eq('id', id).single();
  if (error || !data) throw new Error(error?.message ?? 'Mensagem não encontrada.');
  return data as Message;
}

const isUniqueViolation = (e: { message: string; code?: string }) => e.code === '23505' || /duplicate key/i.test(e.message);

/**
 * Envio de uma mensagem, um contato por vez. Grava `pendente` antes de chamar o provedor (o eco do
 * webhook procura essa linha) e só mexe no contato e na página depois que o provedor aceitou.
 */
export async function sendMessage(
  db: Db,
  provider: Pick<WhatsAppProvider, 'sendText'>,
  input: { contactId: string; text: string; clientMessageId: string },
  now: Date,
  opts: { pageTtlHours?: number } = {},
): Promise<Message> {
  const text = input.text.trim();
  if (!text) throw new Error('Escreva a mensagem antes de enviar.');
  if (!input.clientMessageId) throw new Error('Identificador da mensagem ausente.');

  const contact = await getContact(db, input.contactId);
  if (!contact) throw new Error('Contato não encontrado.');

  // Reenvio do mesmo clique (duplo clique, rede lenta): devolve o que já existe.
  const previous = await findByClientId(db, input.clientMessageId);
  if (previous) return previous;

  const kind = sendKind(contact, now);
  const blocked = sendBlockReason(contact, {
    doNotContact: await isDoNotContact(db, contact.phone_e164),
    connected: await isWhatsAppConnected(db),
    kind,
  });
  if (blocked) throw new Error(blocked);

  const pending = await insertMessage(db, {
    contact_id: contact.id,
    direction: 'saida',
    sent_from: 'painel',
    body: text,
    status: 'pendente',
    client_message_id: input.clientMessageId,
    is_first_contact: kind === 'primeiro',
    is_follow_up: kind === 'follow_up',
    at: now.toISOString(),
  });
  if (!pending) return (await findByClientId(db, input.clientMessageId)) ?? Promise.reject(new Error('Não foi possível registrar a mensagem.'));

  let externalId: string;
  try {
    ({ externalId } = await provider.sendText({ phoneE164: contact.phone_e164, text, clientMessageId: input.clientMessageId }));
  } catch (err) {
    const invalid = (err as { invalidNumber?: boolean }).invalidNumber === true;
    const message = invalid ? INVALID_NUMBER_MESSAGE : ((err as Error).message || 'Não foi possível enviar.');
    await db.from('messages').update({ status: 'erro', error: message }).eq('id', pending.id).eq('status', 'pendente');
    throw new Error(message);
  }

  // Zero linhas = o eco do webhook já ligou a mensagem. 23505 = o eco prendeu esse id a outra linha igual:
  // deixa esta pendente, o prazo de pendentes resolve. Nunca grava uma segunda linha.
  const { error } = await db
    .from('messages')
    .update({ external_id: externalId, status: 'enviada' })
    .eq('id', pending.id)
    .eq('status', 'pendente')
    .is('external_id', null);
  if (error && !isUniqueViolation(error)) throw new Error(error.message);

  await applySendEffects(db, contact, kind, now, opts.pageTtlHours ?? DEFAULT_PAGE_TTL_HOURS);
  return getMessage(db, pending.id);
}

async function applySendEffects(db: Db, contact: Contact, kind: ReturnType<typeof sendKind>, now: Date, ttlHours: number) {
  const patch: Partial<Contact> = {};
  const status = statusAfterSend(contact, kind);
  if (status !== contact.status) {
    patch.status = status;
    patch.status_at = now.toISOString();
  }
  if (kind === 'primeiro') {
    patch.first_contact_at = contact.first_contact_at ?? now.toISOString();
    patch.follow_up_at = followUpDueAt(now).toISOString();
  } else if (kind === 'follow_up') {
    patch.follow_ups_without_reply = contact.follow_ups_without_reply + 1;
    patch.follow_up_at = null; // o follow-up venceu e foi feito
  } else if (contact.follow_up_at && new Date(contact.follow_up_at).getTime() <= now.getTime() && contact.responded_at) {
    patch.follow_up_at = null; // respondeu a quem já tinha falado: o lembrete vencido cumpriu seu papel
  }
  if (Object.keys(patch).length) await updateContact(db, contact.id, patch);

  if (kind === 'primeiro' && contact.lead_id) {
    const { error } = await db
      .from('sites')
      .update({ sent_at: now.toISOString(), expires_at: expiryAfterSend(now, ttlHours).toISOString() })
      .eq('lead_id', contact.lead_id)
      .eq('status', 'modelo')
      .is('sent_at', null);
    if (error) throw new Error(error.message);
  }
}

/** Tentar de novo: manda o texto da mensagem com erro como uma mensagem nova. A antiga continua com erro. */
export async function retryMessage(
  db: Db,
  provider: Pick<WhatsAppProvider, 'sendText'>,
  messageId: string,
  newClientMessageId: string,
  now: Date,
  opts: { pageTtlHours?: number } = {},
): Promise<Message> {
  const old = await getMessage(db, messageId);
  if (old.status !== 'erro' || old.direction !== 'saida' || !old.body) throw new Error('Só dá para tentar de novo uma mensagem com erro.');
  return sendMessage(db, provider, { contactId: old.contact_id, text: old.body, clientMessageId: newClientMessageId }, now, opts);
}
