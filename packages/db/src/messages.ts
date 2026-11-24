import type { Message, MessageMeta, MessageReaction } from '@lps/domain';
import type { Db } from './client';

type MessageStatus = Message['status'];
export type NewMessage = Pick<Message, 'contact_id' | 'direction'> &
  Partial<Pick<Message, 'sent_from' | 'sent_by' | 'sent_by_email' | 'kind' | 'body' | 'media_path' | 'media_mime' | 'status' | 'error' | 'external_id' | 'client_message_id' | 'is_first_contact' | 'is_follow_up' | 'at' | 'quoted_external_id' | 'quoted_preview' | 'meta'>> & {
    /** Importada do histórico: não recebe a conexão atual. */
    history?: boolean;
  };

const KIND_LABEL: Record<Message['kind'], string> = {
  texto: '',
  imagem: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  documento: '📄 Documento',
  sticker: 'Figurinha',
  localizacao: '📍 Localização',
  contato: '👤 Contato',
  enquete: '📊 Enquete',
  outro: 'Mensagem',
};

/** Texto curto para a lista de conversas e para citações. */
export function messagePreview(m: Pick<Message, 'kind' | 'body'> & { meta?: MessageMeta | null }): string {
  const body = m.body?.trim();
  const meta = m.meta ?? {};
  if (m.kind === 'enquete') return `📊 ${body || meta.poll?.name || 'Enquete'}`.slice(0, 120);
  if (body) return body.slice(0, 120);
  if (m.kind === 'audio' && meta.seconds) return `🎤 Áudio (${Math.floor(meta.seconds / 60)}:${String(meta.seconds % 60).padStart(2, '0')})`;
  if (m.kind === 'documento' && meta.fileName) return `📄 ${meta.fileName}`.slice(0, 120);
  if (m.kind === 'video' && meta.round) return '🎬 Recado de vídeo';
  if (m.kind === 'localizacao' && meta.location?.live) return '📍 Localização em tempo real';
  if (m.kind === 'contato' && meta.contacts?.length) return `👤 ${meta.contacts.map((c) => c.name).join(', ')}`.slice(0, 120);
  if (meta.invite) return `Convite para o grupo ${meta.invite.group}`.slice(0, 120);
  if (meta.event) return `📅 ${meta.event.name}`.slice(0, 120);
  return KIND_LABEL[m.kind] || 'Mensagem';
}

export async function listMessages(db: Db, contactId: string, limit = 200): Promise<Message[]> {
  // As mais recentes, devolvidas em ordem cronológica.
  const { data, error } = await db.from('messages').select().eq('contact_id', contactId).neq('direction', 'log').order('at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as Message[]).reverse();
}

/** Logs da conversa (estado, responsável, status), em ordem cronológica. À parte, para não tomar o limite das mensagens. */
export async function listChatLogs(db: Db, contactId: string, limit = 200): Promise<Message[]> {
  const { data, error } = await db.from('messages').select().eq('contact_id', contactId).eq('direction', 'log').order('at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data as Message[]).reverse();
}

/** Grava a mensagem e atualiza o contato numa só transação (função SQL). Devolve nulo se o external_id ou o client_message_id já existia. */
/** Mensagem do contato pelo id do WhatsApp (para montar um reply). */
export async function findByExternalId(db: Db, contactId: string, externalId: string): Promise<Message | null> {
  const { data, error } = await db.from('messages').select().eq('contact_id', contactId).eq('external_id', externalId).limit(1);
  if (error) throw new Error(error.message);
  return ((data as Message[] | null) ?? [])[0] ?? null;
}

export async function insertMessage(db: Db, row: NewMessage): Promise<Message | null> {
  const payload = { kind: 'texto', ...row, preview: messagePreview({ kind: row.kind ?? 'texto', body: row.body ?? null, meta: row.meta ?? null }) };
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

/** Mensagem pelo id do WhatsApp, em qualquer conversa (reação, edição e exclusão só trazem esse id). */
export async function findAnyByExternalId(db: Db, externalId: string): Promise<Message | null> {
  const { data, error } = await db.from('messages').select().eq('external_id', externalId).limit(1);
  if (error) throw new Error(error.message);
  return ((data as Message[] | null) ?? [])[0] ?? null;
}

async function patchMessage(db: Db, id: string, patch: Partial<Message>): Promise<void> {
  const { error } = await db.from('messages').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Se a mensagem é a última da conversa, a prévia da lista acompanha a edição ou a exclusão. */
async function refreshPreview(db: Db, m: Message, preview?: string): Promise<void> {
  const { error } = await db
    .from('contacts')
    .update({ last_message_preview: preview ?? messagePreview(m) })
    .eq('id', m.contact_id)
    .lte('last_message_at', m.at);
  if (error) throw new Error(error.message);
}

/** Uma reação por lado, como no WhatsApp: a nova troca a anterior, e reação vazia remove. */
export function nextReactions(current: MessageReaction[] | null | undefined, from: MessageReaction['from'], emoji: string | null, at: Date): MessageReaction[] {
  const others = (current ?? []).filter((r) => r.from !== from);
  return emoji ? [...others, { from, emoji, at: at.toISOString() }] : others;
}

/** Devolve false quando a mensagem reagida não está no CRM. */
export async function applyReaction(db: Db, targetExternalId: string, from: MessageReaction['from'], emoji: string | null, at: Date): Promise<boolean> {
  const m = await findAnyByExternalId(db, targetExternalId);
  if (!m) return false;
  await patchMessage(db, m.id, { reactions: nextReactions(m.reactions, from, emoji, at) });
  return true;
}

/** Editada no WhatsApp: troca o texto e guarda o original (só o primeiro, se editar de novo). */
export async function applyEdit(db: Db, targetExternalId: string, text: string | null, at: Date): Promise<boolean> {
  const m = await findAnyByExternalId(db, targetExternalId);
  if (!m || text === null || text === m.body) return !!m;
  const meta = { ...(m.meta ?? {}), original_body: m.meta?.original_body ?? m.body };
  await patchMessage(db, m.id, { body: text, meta, edited_at: at.toISOString() });
  await refreshPreview(db, { ...m, body: text, meta });
  return true;
}

/** Apagada para todos: marca, e o conteúdo continua guardado para o painel. */
export async function applyRevoke(db: Db, targetExternalId: string, at: Date): Promise<boolean> {
  const m = await findAnyByExternalId(db, targetExternalId);
  if (!m) return false;
  if (!m.deleted_at) {
    await patchMessage(db, m.id, { deleted_at: at.toISOString() });
    await refreshPreview(db, m, '🚫 Mensagem apagada');
  }
  return true;
}

/** Voto numa enquete: guarda as opções escolhidas por cada lado (voto vazio = tirou o voto). */
export async function applyPollVote(db: Db, targetExternalId: string, from: 'eu' | 'contato', options: string[]): Promise<boolean> {
  const m = await findAnyByExternalId(db, targetExternalId);
  if (!m?.meta?.poll) return false;
  const poll = { ...m.meta.poll, votes: { ...(m.meta.poll.votes ?? {}), [from]: options } };
  await patchMessage(db, m.id, { meta: { ...m.meta, poll } });
  return true;
}
