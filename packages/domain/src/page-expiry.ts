const HOUR = 3_600_000;
const UNSENT_DAYS = 7;

export type PageAccessRow = {
  status: 'modelo' | 'removido';
  published_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
};

export function pageAccess(site: PageAccessRow, now: Date): 'ok' | 'indisponivel' {
  if (site.status !== 'modelo') return 'indisponivel';
  if (!site.published_at && !site.expires_at) return 'indisponivel';
  if (site.expires_at && new Date(site.expires_at) <= now) return 'indisponivel';
  if (!site.sent_at && site.published_at && now.getTime() - new Date(site.published_at).getTime() > UNSENT_DAYS * 24 * HOUR) {
    return 'indisponivel';
  }
  return 'ok';
}

export function expiryAfterSend(sentAt: Date, ttlHours: number): Date {
  return new Date(sentAt.getTime() + ttlHours * HOUR);
}

export function renewExpiry(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() + ttlHours * HOUR);
}
