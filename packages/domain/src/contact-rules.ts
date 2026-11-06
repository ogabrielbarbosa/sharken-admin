import type { Lead } from './types';

const DAY = 86_400_000;
const RECONTACT_DAYS = 180;
export const FOLLOW_UP_DAYS = 3;
export const DAILY_SEND_WARNING = 20;

export type ContactKind = 'first' | 'follow_up';

export function canContact(
  lead: Pick<Lead, 'stage' | 'phone_e164'>,
  ctx: { blocked: boolean; now: Date; lastContactAt: Date | null },
  kind: ContactKind = 'first',
): { allowed: boolean; reason?: string } {
  if (ctx.blocked) return { allowed: false, reason: 'Este contato está em não contatar.' };
  if (!lead.phone_e164) return { allowed: false, reason: 'Lead sem telefone celular.' };
  if (kind === 'first') {
    if (lead.stage !== 'abordar') return { allowed: false, reason: 'Este lead não está em Abordar.' };
    if (ctx.lastContactAt && (ctx.now.getTime() - ctx.lastContactAt.getTime()) / DAY < RECONTACT_DAYS) {
      return { allowed: false, reason: `Este telefone foi contatado há menos de ${RECONTACT_DAYS} dias.` };
    }
  } else if (lead.stage !== 'aguardando') {
    return { allowed: false, reason: 'Este lead não pode receber follow-up.' };
  }
  return { allowed: true };
}

export function isFollowUpDue(lead: Pick<Lead, 'stage' | 'contacted_at'>, now: Date): boolean {
  if (lead.stage !== 'aguardando' || !lead.contacted_at) return false;
  return now.getTime() - new Date(lead.contacted_at).getTime() >= FOLLOW_UP_DAYS * DAY;
}

export function blockEntry(lead: Pick<Lead, 'phone_e164' | 'place_id'>, reason: string) {
  return { phone_e164: lead.phone_e164, place_id: lead.place_id, reason };
}
