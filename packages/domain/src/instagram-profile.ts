import type { NewLead } from './apify-mapper';
import { mobilesInText, toCountryMobile, toWhatsAppLinkMobile } from './phone';
import { classifyLink } from './website';

/** O que o `apify/instagram-profile-scraper` devolve de cada perfil (só o que usamos). */
export type InstagramProfileData = {
  username?: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string | null;
  externalUrls?: { url?: string }[];
  businessCategoryName?: string | null;
  businessPhoneNumber?: string | null;
  publicPhoneNumber?: string | null;
  businessEmail?: string | null;
  publicEmail?: string | null;
  private?: boolean;
  latestPosts?: { timestamp?: string }[];
};

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// (12) 99876-5432, 12 998765432, +55 12 99876 5432...
const PHONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9[\s.-]?\d{4}[\s.-]?\d{4}\b/g;
const WHATSAPP = /(?:wa\.me\/|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\+?\d{8,15})/i;

/** Celular da conta comercial, do link do WhatsApp ou escrito na bio. */
export function phoneFromProfile(p: InstagramProfileData, country = 'BR'): { raw: string | null; e164: string | null } {
  const links = [p.externalUrl ?? '', ...(p.externalUrls ?? []).map((u) => u.url ?? ''), p.biography ?? ''];
  const candidates: { raw: string; e164: string | null }[] = [
    ...[p.businessPhoneNumber, p.publicPhoneNumber].filter((v): v is string => !!v).map((raw) => ({ raw, e164: toCountryMobile(raw, country) })),
    ...links.flatMap((l) => l.match(WHATSAPP)?.[1] ?? []).map((raw) => ({ raw, e164: toWhatsAppLinkMobile(raw, country) })),
    ...(country === 'BR'
      ? (p.biography?.match(PHONE) ?? []).map((raw) => ({ raw, e164: toCountryMobile(raw, country) }))
      : mobilesInText(p.biography ?? '', country)),
  ];
  return candidates.find((c) => c.e164) ?? { raw: candidates[0]?.raw ?? null, e164: null };
}

export function emailFromProfile(p: InstagramProfileData): string | null {
  return p.businessEmail || p.publicEmail || p.biography?.match(EMAIL)?.[0]?.toLowerCase() || null;
}

export function latestPostAt(p: { latestPosts?: { timestamp?: string }[] }): string | null {
  return (p.latestPosts ?? []).map((x) => x.timestamp).filter((t): t is string => !!t).sort().at(-1) ?? null;
}

/**
 * Perfil do Instagram como lead (sem lugar no Maps). O site é o primeiro link que não é rede social; sem ele,
 * fica o link da bio (linktree etc.), que a análise trata como "só rede social".
 */
export function mapProfileToLead(p: InstagramProfileData, batchId: string, ctx: { city: string | null; businessType: string; country?: string }): NewLead | null {
  const username = p.username?.toLowerCase();
  if (!username) return null;
  const links = [p.externalUrl, ...(p.externalUrls ?? []).map((u) => u.url)].filter((u): u is string => !!u && !/wa\.me|whatsapp\.com/i.test(u));
  const website = links.find((u) => classifyLink(u).status === 'site') ?? links[0] ?? null;
  const phone = phoneFromProfile(p, ctx.country);
  return {
    batch_id: batchId,
    place_id: null,
    name: p.fullName?.trim() || username,
    business_type: p.businessCategoryName || ctx.businessType,
    phone_raw: phone.raw,
    phone_e164: phone.e164,
    address: null,
    city: ctx.city,
    is_open: true,
    rating: null,
    reviews_count: 0,
    images_count: 0,
    description: p.biography?.trim() || null,
    categories: p.businessCategoryName ? [p.businessCategoryName] : [],
    photos: [],
    reviews: [],
    website_url: website,
    instagram_url: `https://www.instagram.com/${username}/`,
    instagram_last_post_at: latestPostAt(p),
    email: emailFromProfile(p),
  };
}
