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

export function checkEliminatory(
  lead: Pick<Lead, 'phone_e164' | 'is_open'>,
  ctx: { blocked: boolean; lastContactAt: Date | null; now: Date },
  c: Criteria,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!lead.phone_e164) reasons.push('Sem telefone celular no cadastro');
  if (!lead.is_open) reasons.push('Negócio fechado');
  if (ctx.blocked) reasons.push('Está em não contatar');
  if (ctx.lastContactAt && daysSince(ctx.lastContactAt, ctx.now) < c.recontactDays) reasons.push(`Contatado há menos de ${c.recontactDays} dias`);
  return { passed: reasons.length === 0, reasons };
}
