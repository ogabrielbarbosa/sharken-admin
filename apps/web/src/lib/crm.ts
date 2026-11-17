import { firstContactText, followUpText, looksLikeStopRequest, type Contact, type ContactStatus, type Lead, type Message } from '@lps/domain';
import type { Tone } from '@/components/ui';

export function crmHref(tab: 'aberto' | 'pendente' | 'fechado', extra: { contato?: string; q?: string } = {}) {
  const p = new URLSearchParams({ aba: tab });
  if (extra.q) p.set('q', extra.q);
  if (extra.contato) p.set('contato', extra.contato);
  return `/painel/crm?${p}`;
}

export const STATUS_LABEL: Record<ContactStatus, { label: string; tone: Tone }> = {
  novo: { label: 'Novo', tone: 'neutral' },
  contatado: { label: 'Contatado', tone: 'neutral' },
  follow_up: { label: 'Follow-up enviado', tone: 'warning' },
  em_conversa: { label: 'Em conversa', tone: 'success' },
  fechado: { label: 'Fechado', tone: 'success' },
  perdido: { label: 'Perdido', tone: 'danger' },
  nao_contatar: { label: 'Não contatar', tone: 'danger' },
};

export function isFollowUpDue(c: Pick<Contact, 'status' | 'follow_up_at'>, now: Date): boolean {
  return !!c.follow_up_at && new Date(c.follow_up_at).getTime() <= now.getTime() && c.status !== 'perdido' && c.status !== 'nao_contatar' && c.status !== 'fechado';
}

/**
 * Texto que já vem no campo. O `texto` da URL vence; depois, primeiro contato em `novo` e follow-up vencido
 * em `contatado`. Sem lead ou sem link não há mensagem pronta.
 */
export function composerDraft(input: {
  contact: Pick<Contact, 'status' | 'follow_up_at'>;
  lead: Lead | null;
  link: string | null;
  texto?: string;
  now: Date;
  signer: string;
}): string {
  if (input.texto?.trim()) return input.texto;
  const { contact, lead, link, now } = input;
  if (!lead || !link) return '';
  try {
    if (contact.status === 'novo') return firstContactText(lead, link, input.signer);
    if (contact.status === 'contatado' && isFollowUpDue(contact, now)) return followUpText(link, input.signer);
  } catch {
    // Lead sem cidade, motivo ou outro campo da mensagem: o campo começa vazio.
  }
  return '';
}

/** A última mensagem recebida parece pedido para parar e o Gabriel ainda não respondeu depois dela. */
export function stopRequestPending(messages: Pick<Message, 'direction' | 'body' | 'at'>[]): boolean {
  const lastIn = [...messages].reverse().find((m) => m.direction === 'entrada');
  if (!lastIn?.body || !looksLikeStopRequest(lastIn.body)) return false;
  return !messages.some((m) => m.direction === 'saida' && new Date(m.at) > new Date(lastIn.at));
}

const TZ = 'America/Sao_Paulo';
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Hoje';
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
}
export { dayKey };

/** Horário na lista: hora hoje, "ontem", dia da semana nos últimos 6 dias, data depois. */
export function listTime(iso: string | null, now: Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 86_400_000);
  if (days <= 0) return clock(iso);
  if (days === 1) return 'ontem';
  if (days < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TZ }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
}

/** Eventos gravados que ficam fora do histórico de propósito (internos, de erro ou de andamento do batch). */
export const HIDDEN_EVENTS: ReadonlySet<string> = new Set([
  'encontrado', 'mensagem_recebida', 'erro_analise', 'erro_pagina', 'erro_video', 'video_convertido', 'video_renderizado',
  'etapa_analisando', 'etapa_revisar', 'etapa_gerando_material', 'etapa_revisar_material',
]);

export type CrmEvent = { type: string; data: Record<string, unknown> };

/** Texto do histórico do contato para cada evento do lead. Eventos internos, sem texto, ficam de fora (null). */
export function eventLabel(e: CrmEvent): string | null {
  switch (e.type) {
    case 'abertura': return 'Página aberta';
    case 'mensagem_enviada': return e.data.kind === 'primeiro' ? 'Primeiro contato enviado' : e.data.kind === 'follow_up' ? 'Follow-up enviado' : e.data.kind === 'normal' ? 'Mensagem enviada' : null;
    case 'pedido_parar':
    case 'pediu_para_parar': return 'Pediu para parar';
    case 'numero_invalido': return 'Número sem WhatsApp';
    case 'conversa_aberta': return 'Conversa aberta';
    case 'contato_enviado': return 'Primeiro contato enviado';
    case 'follow_up_enviado': return 'Follow-up enviado';
    case 'etapa_vendido': return 'Vendido';
    case 'etapa_sem_interesse': return 'Sem interesse';
    case 'etapa_nao_contatar': return 'Não contatar';
    case 'etapa_descartado': return 'Descartado';
    case 'modelo_removido': return 'Página removida';
    case 'pagina_gerada': return 'Página gerada';
    case 'etapa_crm': return 'Material aprovado';
    case 'etapa_completar': return 'Lead avançado';
    case 'contrato_criado': return 'Contrato criado';
    case 'contrato_assinado': return 'Contrato assinado';
    case 'pagamento_recebido': return 'Pagamento recebido';
    case 'contato_criado': return 'Contato criado';
    case 'contato_ligado': return e.data.vinculado === false ? null : 'Contato ligado ao lead';
    case 'contato_desligado': return 'Contato desligado do lead';
  }
  if (e.type.startsWith('contato_')) {
    const status = STATUS_LABEL[e.type.slice(8) as ContactStatus];
    return status ? `Status: ${status.label}` : null;
  }
  return null;
}

/** Duração curta: 12 min, 9 h 54, 3 d 4 h. */
export function duration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Tempo relativo: há 33 minutos, há 2 horas, há 3 dias. */
export function ago(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} minuto${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? '' : 's'}`;
}

/** +55 11 98765-4321 */
export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}
