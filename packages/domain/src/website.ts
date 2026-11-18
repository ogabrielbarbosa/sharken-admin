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

/** Caminhos do Instagram que não são perfil (post, reels, páginas do próprio Instagram). */
const INSTAGRAM_RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal',
  'developer', 'share', 's', 'web', 'privacy', 'terms', 'instagram', 'oauth', 'challenge',
]);

/**
 * Primeiro perfil do Instagram entre os links de uma página (rodapé, cabeçalho, ícones).
 * Ignora links de post e de páginas do Instagram. Devolve `https://www.instagram.com/<usuario>/`.
 */
export function instagramProfileFromLinks(hrefs: readonly string[]): string | null {
  for (const href of hrefs) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(href.trim()) ? href.trim() : `https://${href.trim()}`);
    } catch {
      continue;
    }
    if (!matches(url.hostname.toLowerCase(), 'instagram.com')) continue;
    const parts = url.pathname.split('/').filter(Boolean);
    // instagram.com/usuario, às vezes com /reels ou /tagged no fim.
    const user = parts[0]?.replace(/^@/, '').toLowerCase();
    if (!user || INSTAGRAM_RESERVED.has(user) || !/^[a-z0-9._]{1,30}$/.test(user)) continue;
    // Perfil de quem fez o site, não do negócio.
    if (/web.?design|designer|ag[eê]ncia|agency|sites?$/.test(user)) continue;
    return `https://www.instagram.com/${user}/`;
  }
  return null;
}
