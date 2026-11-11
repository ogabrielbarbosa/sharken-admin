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
};

export type Message = {
  id: string;
  created_at: string;
  contact_id: string;
  direction: 'entrada' | 'saida';
  sent_from: 'painel' | 'celular' | null;
  kind: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'outro';
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
};

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
export function outreachKind(responded: boolean, sentCount: number): SendKind | 'bloqueado' {
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

export function firstContactText(lead: Lead, link: string): string {
  return selectFirstMessage(lead, MESSAGES, { link });
}

export function followUpText(link: string): string {
  return MESSAGES.follow_up.replace('[link]', link);
}
