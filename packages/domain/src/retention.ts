import type { SiteRow } from './site-access';
import type { Lead } from './types';

const DAY = 86_400_000;
const RETENTION_DAYS = 180;

type RetentionInput = Pick<Lead, 'stage' | 'created_at' | 'contacted_at' | 'follow_up_at' | 'responded_at'> & { hasClient: boolean };

export function shouldDeleteLead(lead: RetentionInput, now: Date): boolean {
  if (lead.hasClient || lead.responded_at || lead.stage === 'crm' || lead.stage === 'vendido') return false;
  const reference = lead.follow_up_at ?? lead.contacted_at ?? lead.created_at;
  return now.getTime() - new Date(reference).getTime() >= RETENTION_DAYS * DAY;
}

export function shouldRemoveSite(site: Pick<SiteRow, 'status' | 'expires_at'>, now: Date): boolean {
  return site.status === 'modelo' && !!site.expires_at && new Date(site.expires_at) <= now;
}
