import type { Criteria } from './criteria';
import type { Lead, ScoreReason } from './types';

const DAY = 86_400_000;
const daysSince = (date: Date | string, now: Date) => (now.getTime() - new Date(date).getTime()) / DAY;

type ScoreInput = Pick<Lead, 'reviews_count' | 'rating' | 'images_count' | 'instagram_last_post_at' | 'description' | 'site_data'>;

export function scoreLead(lead: ScoreInput, c: Criteria, now: Date): { score: number; reasons: ScoreReason[] } {
  const instagramDays = lead.instagram_last_post_at ? Math.floor(daysSince(lead.instagram_last_post_at, now)) : null;
  const rating = lead.rating ?? 0;
  const reasons: ScoreReason[] = [
    { label: `Avaliações ${lead.reviews_count}`, points: 25, met: lead.reviews_count >= c.minReviews },
    { label: `Nota ${rating.toFixed(1).replace('.', ',')}`, points: 20, met: rating >= c.minRating },
    { label: `Fotos ${lead.images_count}`, points: 20, met: lead.images_count >= c.minPhotos },
    {
      label: instagramDays === null ? 'Instagram não encontrado' : instagramDays <= c.instagramActiveDays ? 'Instagram ativo' : `Instagram parado há ${instagramDays} dias`,
      points: 20,
      met: instagramDays !== null && instagramDays <= c.instagramActiveDays,
    },
    { label: 'Descrição ou serviços', points: 15, met: !!(lead.description?.trim() || lead.site_data?.text?.trim()) },
  ];
  return { score: reasons.reduce((sum, r) => sum + (r.met ? r.points : 0), 0), reasons };
}

/**
 * O que tira o lead da pipeline logo na busca: quem não tem como ser contatado (sem celular e sem e-mail),
 * franquia ou rede, quem pediu para não ser contatado, quem foi contatado há pouco e quem não atende
 * aos critérios marcados no batch (Instagram ativo, celular, com ou sem site).
 */
export function checkEliminatory(
  lead: Pick<Lead, 'phone_e164' | 'email' | 'franchise'> & Partial<Pick<Lead, 'instagram_last_post_at' | 'site_status'>>,
  ctx: { blocked: boolean; lastContactAt: Date | null; now: Date },
  c: Criteria,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!lead.phone_e164 && !lead.email) reasons.push('Sem celular e sem e-mail');
  if (lead.franchise) reasons.push('Franquia ou rede');
  if (ctx.blocked) reasons.push('Está em não contatar');
  if (ctx.lastContactAt && daysSince(ctx.lastContactAt, ctx.now) < c.recontactDays) reasons.push(`Contatado há menos de ${c.recontactDays} dias`);
  if (c.requireInstagramActive && !(lead.instagram_last_post_at && daysSince(lead.instagram_last_post_at, ctx.now) <= c.instagramActiveDays)) {
    reasons.push(`Sem post no Instagram nos últimos ${c.instagramActiveDays} dias`);
  }
  if (c.requirePhone && !lead.phone_e164) reasons.push('Sem celular');
  if (c.site === 'sem_site' && lead.site_status === 'funcionando') reasons.push('Tem site');
  if (c.site === 'com_site' && lead.site_status && lead.site_status !== 'funcionando') reasons.push('Sem site funcionando');
  return { passed: reasons.length === 0, reasons };
}
