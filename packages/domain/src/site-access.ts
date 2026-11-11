import type { LeadStage } from './stages';

export type SiteRow = { status: 'modelo' | 'removido'; expires_at: string };

export function getSiteAccess(site: SiteRow, now: Date): 'ok' | 'indisponivel' {
  if (site.status !== 'modelo') return 'indisponivel';
  return new Date(site.expires_at) > now ? 'ok' : 'indisponivel';
}

const CONTACTED: LeadStage[] = ['crm', 'vendido'];

export function shouldRecordOpen(ctx: { stage: LeadStage; isAdmin: boolean; isCapture: boolean }): boolean {
  return !ctx.isAdmin && !ctx.isCapture && CONTACTED.includes(ctx.stage);
}
