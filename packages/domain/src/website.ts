const SOCIAL_DOMAINS = [
  'instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'beacons.ai', 'bio.site',
  'wa.me', 'whatsapp.com', 'tiktok.com', 'youtube.com', 'ifood.com.br',
];

export type LinkClass = { status: 'sem_link' | 'somente_social' | 'site'; instagramUrl: string | null };

function hostOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function classifyLink(url: string | null | undefined): LinkClass {
  const trimmed = url?.trim();
  if (!trimmed) return { status: 'sem_link', instagramUrl: null };
  const host = hostOf(trimmed);
  if (!host) return { status: 'sem_link', instagramUrl: null };
  if (SOCIAL_DOMAINS.some((d) => matches(host, d))) {
    return { status: 'somente_social', instagramUrl: matches(host, 'instagram.com') ? trimmed : null };
  }
  return { status: 'site', instagramUrl: null };
}
