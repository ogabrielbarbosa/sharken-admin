import { MESSAGES } from '@lps/config/messages';
import { selectFirstMessage } from './messages';
import type { Lead } from './types';

export type ContactStatus = 'novo' | 'contatado' | 'follow_up' | 'em_conversa' | 'fechado' | 'perdido' | 'nao_contatar';
export type SendKind = 'primeiro' | 'follow_up' | 'normal';

export type Contact = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  phone_e164: string;
  whatsapp_lid: string | null;
  lead_id: string | null;
  origin: 'batch' | 'whatsapp_direto' | 'manual';
  batch_id: string | null;
  status: ContactStatus;
  status_at: string;
  first_contact_at: string | null;
  responded_at: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  follow_ups_without_reply: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unread_count: number;
  comment: string | null;
  chat_state: ChatState;
  chat_state_at: string;
  /** Membro responsável pelo atendimento. Aberto sempre tem um (garantido pelo banco, 0029). */
  responsible_id: string | null;
  /** Quem definiu o responsável; nulo quando foi automático. */
  responsible_by: string | null;
  avatar_url: string | null;
  avatar_checked_at: string | null;
};

/** Estado do atendimento, separado do status comercial. */
export type ChatState = 'aberto' | 'pendente' | 'fechado';

export type Message = {
  id: string;
  created_at: string;
  contact_id: string;
  /** `nota` é interna: aparece só no painel. */
  direction: 'entrada' | 'saida' | 'nota';
  sent_from: 'painel' | 'celular' | null;
  /** Usuário que enviou pelo painel. Nulo nas recebidas, nas do celular e nas anteriores à migração 0026. */
  sent_by: string | null;
  sent_by_email: string | null;
  /** Conexão do WhatsApp no momento do envio. Nula nas recebidas, nas notas e nas anteriores à migração 0028. */
  connection_phone: string | null;
  connection_name: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_mime: string | null;
  status: 'recebida' | 'pendente' | 'enviada' | 'entregue' | 'lida' | 'erro';
  error: string | null;
  external_id: string | null;
  client_message_id: string | null;
  is_first_contact: boolean;
  is_follow_up: boolean;
  at: string;
  /** Reply: id no WhatsApp da mensagem citada e um trecho dela. */
  quoted_external_id: string | null;
  quoted_preview: string | null;
  /** Detalhes de cada tipo (duração do áudio, nome do arquivo, coordenadas...). */
  meta: MessageMeta;
  reactions: MessageReaction[];
  edited_at: string | null;
  /** Apagada para todos no WhatsApp. O conteúdo continua guardado, só para o painel. */
  deleted_at: string | null;
};

export type MessageKind = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'localizacao' | 'contato' | 'enquete' | 'outro';

export type MessageButton = { label: string; url?: string | null };
export type SharedContact = { name: string; phones: string[] };

/** Tudo opcional: cada tipo usa o que precisa. Mensagens antigas têm meta vazio. */
export type MessageMeta = {
  /** Áudio e vídeo, em segundos. */
  seconds?: number;
  /** Áudio gravado na hora (mensagem de voz) e não um arquivo de áudio encaminhado. */
  ptt?: boolean;
  /** Forma de onda do áudio, 0 a 100 (vem do WhatsApp em 64 amostras). */
  waveform?: number[];
  /** Vídeo redondo (recado de vídeo). */
  round?: boolean;
  /** Vídeo curto que toca em loop, sem som. */
  gif?: boolean;
  width?: number;
  height?: number;
  fileName?: string;
  /** Em bytes. */
  size?: number;
  pages?: number;
  animated?: boolean;
  /** Figurinha Lottie: o navegador não desenha, aparece como figurinha animada. */
  lottie?: boolean;
  viewOnce?: boolean;
  forwarded?: boolean;
  location?: { lat: number; lng: number; name?: string | null; address?: string | null; url?: string | null; live?: boolean };
  contacts?: SharedContact[];
  /** votes: as opções escolhidas por cada lado (eu e o contato). */
  poll?: { name: string; options: string[]; multiple: boolean; votes?: Partial<Record<'eu' | 'contato', string[]>> };
  /** Botões de mensagens de empresa (modelo, interativa, lista). Só aparecem, não são clicáveis no WhatsApp de quem recebe pelo painel. */
  buttons?: MessageButton[];
  title?: string | null;
  footer?: string | null;
  /** Convite de grupo e evento: o que aparece no cartão. */
  invite?: { group: string };
  event?: { name: string; description?: string | null; startsAt?: string | null };
  /** Tipo que o painel ainda não sabe mostrar (nome do WhatsApp, ex.: "callLogMesssage"). */
  unsupported?: string;
  /** Texto antes da edição. */
  original_body?: string | null;
};

/** `from`: quem reagiu. Reação vazia remove. */
export type MessageReaction = { from: 'eu' | 'contato'; emoji: string; at: string };

const FOLLOW_UP_MS = 3 * 24 * 3600_000;

// Mudança manual de status. `perdido -> em_conversa` só acontece por mensagem recebida.
export function canSetStatus(from: ContactStatus, to: ContactStatus): boolean {
  if (from === 'nao_contatar') return false;
  if (from === to) return false;
  if (to === 'perdido' || to === 'nao_contatar' || to === 'fechado') return true;
  if (from === 'perdido' && to === 'em_conversa') return false;
  return true;
}

export function statusAfterSend(c: Pick<Contact, 'status'>, kind: SendKind): ContactStatus {
  if (kind === 'primeiro' && c.status === 'novo') return 'contatado';
  if (kind === 'follow_up' && (c.status === 'contatado' || c.status === 'follow_up')) return 'follow_up';
  return c.status;
}

export function statusAfterInbound(c: Pick<Contact, 'status'>): ContactStatus {
  return c.status === 'novo' || c.status === 'contatado' || c.status === 'follow_up' || c.status === 'perdido' ? 'em_conversa' : c.status;
}

/** Números de exemplo (pnpm crm:demo) usam o DDD 00, que não existe. */
export function isDemoPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').startsWith('5500');
}

export function sendBlockReason(
  c: Pick<Contact, 'status' | 'follow_ups_without_reply' | 'responded_at'>,
  opts: { doNotContact: boolean; connected: boolean; kind: SendKind },
): string | null {
  if (c.status === 'nao_contatar' || opts.doNotContact) return 'Este contato pediu para não receber mensagens.';
  if (!opts.connected) return 'WhatsApp desconectado. Reconecte para enviar.';
  if (c.status === 'follow_up' && c.follow_ups_without_reply >= 1 && !c.responded_at) return 'Já foi enviado um follow-up sem resposta.';
  return null;
}

export function followUpDueAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + FOLLOW_UP_MS);
}

/**
 * Política de alcance: enquanto a pessoa não respondeu, a 1ª mensagem é o primeiro contato, a 2ª é o único
 * follow-up e a 3ª em diante é bloqueada. Depois da resposta não há limite.
 */
export function outreachKind(status: ContactStatus, responded: boolean, sentCount: number): SendKind | 'bloqueado' {
  // Cliente fechado ou conversa em andamento: nunca é prospecção fria, sem limite nem efeitos de primeiro contato.
  if (status === 'fechado' || status === 'em_conversa') return 'normal';
  if (responded) return 'normal';
  if (sentCount <= 0) return 'primeiro';
  if (sentCount === 1) return 'follow_up';
  return 'bloqueado';
}

export function sendKind(c: Pick<Contact, 'status' | 'follow_up_at'>, now: Date): SendKind {
  if (c.status === 'novo') return 'primeiro';
  if (c.status === 'contatado' && c.follow_up_at && new Date(c.follow_up_at).getTime() <= now.getTime()) return 'follow_up';
  return 'normal';
}

/** `signer` é quem fala na mensagem ("Aqui é o ..."): o nome nas Configurações do workspace. */
export function firstContactText(lead: Lead, link: string, signer: string): string {
  return selectFirstMessage(lead, MESSAGES, { link, signer });
}

export function followUpText(link: string, signer: string): string {
  return MESSAGES.follow_up.replace('[link]', link).replace('[seu nome]', signer);
}
