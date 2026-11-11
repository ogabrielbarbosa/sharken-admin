import type { Message } from '@lps/domain';
import type { Db } from './client';

type MessageStatus = Message['status'];
export type NewMessage = Pick<Message, 'contact_id' | 'direction'> &
  Partial<Pick<Message, 'sent_from' | 'kind' | 'body' | 'media_path' | 'media_mime' | 'status' | 'error' | 'external_id' | 'client_message_id' | 'is_first_contact' | 'is_follow_up' | 'at'>>;

const KIND_LABEL: Record<Message['kind'], string> = {
  texto: '',
  imagem: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  documento: '📄 Documento',
  outro: 'Mensagem',
};

export function messagePreview(m: Pick<Message, 'kind' | 'body'>): string {
  const body = m.body?.trim();
  if (body) return body.slice(0, 120);
  return KIND_LABEL[m.kind] || 'Mensagem';
}

export async function listMessages(db: Db, contactId: string, limit = 200): Promise<Message[]> {
  // As mais recentes, devolvidas em ordem cronológica.
  const { data, error } = await db.from('messages').select().eq('contact_id', contactId).order('at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as Message[]).reverse();
}

/** Grava a mensagem e atualiza o contato numa só transação (função SQL). Devolve nulo se o external_id ou o client_message_id já existia. */
export async function insertMessage(db: Db, row: NewMessage): Promise<Message | null> {
  const payload = { kind: 'texto', ...row, preview: messagePreview({ kind: row.kind ?? 'texto', body: row.body ?? null }) };
  const { data, error } = await db.rpc('crm_insert_message', { p: payload });
  if (error) throw new Error(error.message);
  return ((data as Message[] | null) ?? [])[0] ?? null;
}

// Para onde cada status pode avançar: só a partir de status mais baixos. `recebida` nunca muda.
const PREVIOUS: Record<MessageStatus, MessageStatus[]> = {
  recebida: [],
  pendente: [],
  enviada: ['pendente'],
  entregue: ['pendente', 'enviada'],
  lida: ['pendente', 'enviada', 'entregue'],
  erro: ['pendente', 'enviada'],
};

/** Aplica o status vindo do WhatsApp sem nunca voltar atrás. A guarda de ordem fica no where. */
export async function applyStatus(db: Db, externalId: string, status: MessageStatus): Promise<boolean> {
  const previous = PREVIOUS[status];
  if (!previous.length) return false;
  const { data, error } = await db.from('messages').update({ status }).eq('external_id', externalId).in('status', previous).select();
  if (error) throw new Error(error.message);
  return ((data as Message[] | null) ?? []).length > 0;
}

/** Eco de uma mensagem enviada pelo painel que ainda espera o external_id. */
export async function findPendingEcho(db: Db, contactId: string, body: string, since: Date): Promise<Message | null> {
  const { data, error } = await db
    .from('messages')
    .select()
    .eq('contact_id', contactId)
    .eq('direction', 'saida')
    .eq('sent_from', 'painel')
    .eq('status', 'pendente')
    .eq('body', body)
    .gte('at', since.toISOString())
    .order('at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data as Message[] | null) ?? [])[0] ?? null;
}

/** Mensagens que ficaram pendentes além do prazo viram erro. Devolve quantas mudaram. */
export async function markStalePending(db: Db, olderThan: Date): Promise<number> {
  const { data, error } = await db
    .from('messages')
    .update({ status: 'erro', error: 'Sem confirmação de envio.' })
    .eq('status', 'pendente')
    .lt('at', olderThan.toISOString())
    .select('id');
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length;
}

export async function markRead(db: Db, contactId: string): Promise<void> {
  const { error } = await db.from('contacts').update({ unread_count: 0 }).eq('id', contactId);
  if (error) throw new Error(error.message);
}

const SAO_PAULO_OFFSET_MS = 3 * 3600_000; // sem horário de verão desde 2019

/** Primeiros contatos enviados no dia de hoje, em America/Sao_Paulo. */
export async function firstContactsToday(db: Db, now: Date): Promise<number> {
  const local = new Date(now.getTime() - SAO_PAULO_OFFSET_MS);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + SAO_PAULO_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_first_contact', true)
    .gte('at', start.toISOString())
    .lt('at', end.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
