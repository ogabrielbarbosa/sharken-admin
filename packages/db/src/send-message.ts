import {
  followUpDueAt,
  isDemoPhone,
  outreachKind,
  phoneMatchCandidates,
  sendBlockReason,
  statusAfterSend,
  type Contact,
  type Message,
  type OutboundMedia,
  type SendKind,
  type WhatsAppProvider,
} from '@lps/domain';
import type { Db } from './client';
import { getContact } from './contacts';
import { logEvent } from './leads';
import { insertMessage } from './messages';

export const INVALID_NUMBER_MESSAGE = 'Número sem WhatsApp';

export async function isDoNotContact(db: Db, phoneE164: string): Promise<boolean> {
  const { data, error } = await db.from('do_not_contact').select('phone_e164').in('phone_e164', phoneMatchCandidates(phoneE164)).limit(1);
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** Só 'desconectado' bloqueia. Sem linha, o estado é desconhecido e o provedor responde por si. */
export async function isWhatsAppConnected(db: Db): Promise<boolean> {
  const { data, error } = await db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { state: string } | null)?.state !== 'desconectado';
}

export const FOLLOW_UP_LIMIT_MESSAGE = 'Já foi enviado um follow-up sem resposta.';

/** Mensagens do painel já aceitas pelo WhatsApp. Contatos migrados da v1 contam pelo que o contato já registra. */
export async function outreachCount(db: Db, contact: Contact): Promise<number> {
  const { data, error } = await db
    .from('messages')
    .select('id')
    .eq('contact_id', contact.id)
    .eq('direction', 'saida')
    .eq('sent_from', 'painel')
    .in('status', ['enviada', 'entregue', 'lida']);
  if (error) throw new Error(error.message);
  const recorded = ((data as unknown[] | null) ?? []).length;
  return Math.max(recorded, (contact.first_contact_at ? 1 : 0) + contact.follow_ups_without_reply);
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
 * webhook procura essa linha) e só mexe no contato e no lead depois que o provedor aceitou.
 */
export async function sendMessage(
  db: Db,
  provider: Pick<WhatsAppProvider, 'sendText'> & Partial<Pick<WhatsAppProvider, 'sendMedia'>>,
  input: { contactId: string; text: string; clientMessageId: string; media?: OutboundMedia & { path: string } },
  now: Date,
): Promise<Message> {
  const text = input.text.trim();
  const media = input.media;
  if (!text && !media) throw new Error('Escreva a mensagem antes de enviar.');
  if (!input.clientMessageId) throw new Error('Identificador da mensagem ausente.');

  const contact = await getContact(db, input.contactId);
  if (!contact) throw new Error('Contato não encontrado.');
  if (isDemoPhone(contact.phone_e164)) throw new Error('Contato de exemplo: nada foi enviado.');

  // Reenvio do mesmo clique (duplo clique, rede lenta): devolve o que já existe.
  const previous = await findByClientId(db, input.clientMessageId);
  if (previous) return previous;

  const kind = outreachKind(contact.status, !!contact.responded_at, await outreachCount(db, contact));
  const blocked = sendBlockReason(contact, {
    doNotContact: await isDoNotContact(db, contact.phone_e164),
    connected: await isWhatsAppConnected(db),
    kind: kind === 'bloqueado' ? 'normal' : kind,
  });
  if (blocked) throw new Error(blocked);
  if (kind === 'bloqueado') throw new Error(FOLLOW_UP_LIMIT_MESSAGE);

  const pending = await insertMessage(db, {
    contact_id: contact.id,
    direction: 'saida',
    sent_from: 'painel',
    kind: media?.kind ?? 'texto',
    body: text || null,
    media_path: media?.path ?? null,
    media_mime: media?.mime ?? null,
    status: 'pendente',
    client_message_id: input.clientMessageId,
    is_first_contact: kind === 'primeiro',
    is_follow_up: kind === 'follow_up',
    at: now.toISOString(),
  });
  if (!pending) return (await findByClientId(db, input.clientMessageId)) ?? Promise.reject(new Error('Não foi possível registrar a mensagem.'));

  let externalId: string;
  try {
    if (media) {
      if (!provider.sendMedia) throw new Error('Este provedor não envia arquivos.');
      ({ externalId } = await provider.sendMedia({ phoneE164: contact.phone_e164, media, caption: media.kind === 'audio' ? null : text || null }));
    } else {
      ({ externalId } = await provider.sendText({ phoneE164: contact.phone_e164, text, clientMessageId: input.clientMessageId }));
    }
  } catch (err) {
    const invalid = (err as { invalidNumber?: boolean }).invalidNumber === true;
    const message = invalid ? INVALID_NUMBER_MESSAGE : ((err as Error).message || 'Não foi possível enviar.');
    await db.from('messages').update({ status: 'erro', error: message }).eq('id', pending.id).eq('status', 'pendente');
    throw new Error(message);
  }

  // Daqui em diante a mensagem já saiu: nenhuma falha de banco pode virar erro para quem clicou.
  try {
    // Zero linhas = o eco do webhook já ligou a mensagem. 23505 = o eco prendeu esse id a outra linha igual:
    // deixa esta pendente, o prazo de pendentes resolve. Nunca grava uma segunda linha.
    const { error } = await db
      .from('messages')
      .update({ external_id: externalId, status: 'enviada' })
      .eq('id', pending.id)
      .eq('status', 'pendente')
      .is('external_id', null);
    if (error && !isUniqueViolation(error)) console.error('send-message: ligar external_id falhou', error.message);
  } catch (err) {
    console.error('send-message: ligar external_id falhou', err);
  }
  try {
    await applySendEffects(db, contact, pending.id, kind as SendKind, now);
  } catch (err) {
    console.error('send-message: efeitos do envio falharam', err);
  }
  try {
    return await getMessage(db, pending.id);
  } catch {
    return pending;
  }
}

async function applySendEffects(db: Db, contact: Contact, messageId: string, kind: SendKind, now: Date) {
  const patch: Partial<Contact> = {};
  let status = statusAfterSend(contact, kind);
  if (kind === 'follow_up' && ['novo', 'contatado', 'follow_up'].includes(contact.status)) status = 'follow_up';
  if (status !== contact.status) {
    patch.status = status;
    patch.status_at = now.toISOString();
  }
  if (kind === 'primeiro') {
    patch.first_contact_at = contact.first_contact_at ?? now.toISOString();
    patch.follow_up_at = followUpDueAt(now).toISOString();
  } else if (kind === 'follow_up') {
    patch.follow_ups_without_reply = contact.follow_ups_without_reply + 1;
    patch.follow_up_at = null; // o follow-up foi feito
  } else if (contact.follow_up_at && new Date(contact.follow_up_at).getTime() <= now.getTime() && contact.responded_at) {
    patch.follow_up_at = null; // respondeu a quem já tinha falado: o lembrete vencido cumpriu seu papel
  }
  let applied = false;
  if (Object.keys(patch).length) {
    // Guarda de status: uma resposta que chegou nesse meio tempo não é sobrescrita.
    const { data, error } = await db.from('contacts').update(patch).eq('id', contact.id).eq('status', contact.status).select('id');
    if (error) throw new Error(error.message);
    applied = ((data as unknown[] | null) ?? []).length > 0;
    if (!applied && kind === 'primeiro' && !contact.first_contact_at) {
      await db.from('contacts').update({ first_contact_at: patch.first_contact_at }).eq('id', contact.id);
    }
  }

  if (!contact.lead_id) return;
  await logEvent(db, contact.lead_id, 'mensagem_enviada', { message_id: messageId, kind });
  if (applied && patch.status) await logEvent(db, contact.lead_id, `contato_${patch.status}`, { por: 'envio' });

  if (kind === 'primeiro') {
    const lead = await db.from('leads').update({ contacted_at: now.toISOString() }).eq('id', contact.lead_id).is('contacted_at', null);
    if (lead.error) throw new Error(lead.error.message);
  }
}

/** Tentar de novo: manda o texto da mensagem com erro como uma mensagem nova. A antiga continua com erro. */
export async function retryMessage(
  db: Db,
  provider: Pick<WhatsAppProvider, 'sendText'>,
  messageId: string,
  newClientMessageId: string,
  now: Date,
): Promise<Message> {
  const old = await getMessage(db, messageId);
  if (old.status !== 'erro' || old.direction !== 'saida' || !old.body) throw new Error('Só dá para tentar de novo uma mensagem com erro.');
  return sendMessage(db, provider, { contactId: old.contact_id, text: old.body, clientMessageId: newClientMessageId }, now);
}
