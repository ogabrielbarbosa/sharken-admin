import { firstContactText, followUpText, looksLikeStopRequest, type Contact, type ContactStatus, type Lead, type Message } from '@lps/domain';
import type { Tone } from '@/components/ui';

export const STATUS_LABEL: Record<ContactStatus, { label: string; tone: Tone }> = {
  novo: { label: 'Novo', tone: 'neutral' },
  contatado: { label: 'Contatado', tone: 'neutral' },
  follow_up: { label: 'Follow-up enviado', tone: 'warning' },
  em_conversa: { label: 'Em conversa', tone: 'success' },
  fechado: { label: 'Fechado', tone: 'success' },
  perdido: { label: 'Perdido', tone: 'danger' },
  nao_contatar: { label: 'Não contatar', tone: 'danger' },
};

/** Link público da página modelo: domínio próprio quando há, senão a rota interna. */
export function pageLink(slug: string, env: { pagesHost?: string; appUrl: string }): string {
  return env.pagesHost ? `https://${env.pagesHost}/${slug}` : `${env.appUrl.replace(/\/$/, '')}/p/${slug}`;
}

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
}): string {
  if (input.texto?.trim()) return input.texto;
  const { contact, lead, link, now } = input;
  if (!lead || !link) return '';
  try {
    if (contact.status === 'novo') return firstContactText(lead, link);
    if (contact.status === 'contatado' && isFollowUpDue(contact, now)) return followUpText(link);
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

export function timeUntil(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'expirada';
  const h = Math.ceil(ms / 3_600_000);
  return h >= 48 ? `${Math.ceil(h / 24)} dias` : `${h} h`;
}
