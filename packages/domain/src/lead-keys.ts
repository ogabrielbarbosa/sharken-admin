import { INSTAGRAM_RESERVED, SOCIAL_DOMAINS } from './website';

/**
 * Chaves para reconhecer o mesmo negócio vindo de fontes diferentes (Maps, Instagram, busca, site).
 * O banco calcula as mesmas chaves (funções `lead_instagram_handle` e `lead_site_domain`, migração 0023):
 * mudou aqui, mude lá. O teste `lead-keys.test.ts` do pacote db compara as duas.
 */

/** Domínios que muitos negócios usam e que, por isso, não identificam ninguém. */
export const SHARED_DOMAINS = [...SOCIAL_DOMAINS, 'google.com', 'goo.gl', 'g.page', 'bit.ly', 'doctoralia.com.br', 'taplink.cc'];

/** `https://www.instagram.com/Clinica.Sorriso/?hl=pt` → `clinica.sorriso`. Null para post, reel, explorar etc. */
export function instagramHandle(url: string | null | undefined): string | null {
  const m = url?.match(/instagram\.com\/@?([a-z0-9._]{1,30})/i);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  return INSTAGRAM_RESERVED.has(handle) ? null : handle;
}

/** `https://www.Clinica.com.br/contato` → `clinica.com.br`. Null para rede social, encurtador e afins. */
export function siteDomain(url: string | null | undefined): string | null {
  const m = url?.trim().match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/:?#\s]+)/i);
  if (!m) return null;
  const host = m[1].toLowerCase().replace(/^www\./, '');
  if (!host.includes('.')) return null;
  return SHARED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) ? null : host;
}
