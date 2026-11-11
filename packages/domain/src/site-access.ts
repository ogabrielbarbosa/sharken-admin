import { pageAccess, type PageAccessRow } from './page-expiry';
import type { LeadStage } from './stages';

export type SiteRow = PageAccessRow;

export function getSiteAccess(site: SiteRow, now: Date): 'ok' | 'indisponivel' {
  return pageAccess(site, now);
}

const CONTACTED: LeadStage[] = ['crm', 'vendido'];

export function shouldRecordOpen(ctx: { stage: LeadStage; isAdmin: boolean; isCapture: boolean }): boolean {
  return !ctx.isAdmin && !ctx.isCapture && CONTACTED.includes(ctx.stage);
}
