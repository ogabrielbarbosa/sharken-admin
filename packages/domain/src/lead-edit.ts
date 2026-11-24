import { normalizeLinkUrl } from './completar';
import { instagramHandle } from './lead-keys';
import { toCountryMobile, toWhatsAppLinkMobile } from './phone';
import type { Lead } from './types';

/** Campos do lead que dá para editar na ficha. */
export const LEAD_FIELDS = {
  name: 'Nome', business_type: 'Tipo de negócio', phone: 'Celular', email: 'E-mail', city: 'Cidade', address: 'Endereço',
  instagram_url: 'Instagram', website_url: 'Site', maps_url: 'Google Meu Negócio', description: 'Descrição',
  comment: 'Comentário interno', reason: 'Motivo', batch: 'Batch',
} as const;
export type LeadField = Exclude<keyof typeof LEAD_FIELDS, 'batch' | 'comment' | 'reason'>;
export type LeadChange = { campo: keyof typeof LEAD_FIELDS; de: string | null; para: string | null };

/** `@perfil` ou link do perfil → `https://www.instagram.com/perfil/`. */
export function parseInstagramInput(raw: string): string | null {
  const text = raw.trim();
  const isUser = /^@?[a-z0-9._]{1,30}$/i.test(text) && !/^(www\.)?instagram\.com$/i.test(text);
  const handle = instagramHandle(isUser ? `https://www.instagram.com/${text.replace(/^@/, '')}/` : text);
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

/** Link de um lugar no Google Maps (inclui os curtos do botão Compartilhar). */
export function parseMapsUrl(raw: string): string | null {
  const url = normalizeLinkUrl(raw);
  if (!url) return null;
  const { hostname, pathname, searchParams } = new URL(url);
  const host = hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'maps.app.goo.gl' || host === 'g.page') return url;
  if (host === 'goo.gl') return pathname.startsWith('/maps') ? url : null;
  if (/^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return url;
  if (!/^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return null;
  return pathname.startsWith('/maps') || (pathname === '/' && searchParams.has('cid')) ? url : null;
}

/** Celular digitado: com `+` vale o código digitado; sem ele, o país do lead. */
export function parseMobileInput(raw: string, country = 'BR'): string | null {
  const text = raw.trim();
  if (text.startsWith('+') && !text.replace(/\s/g, '').startsWith('+55')) return toWhatsAppLinkMobile(text.replace(/\D/g, ''), 'US');
  return toCountryMobile(text, text.startsWith('+') ? 'BR' : country);
}

/** Valida um campo editado e diz o que gravar. Vazio limpa (menos o nome). */
export function editLeadField(lead: Lead, field: LeadField, raw: string, country = 'BR'): { patch: Partial<Lead>; change: LeadChange } | { error: string } | null {
  const text = raw.trim();
  const done = (patch: Partial<Lead>, de: string | null, para: string | null) => (de === para ? null : { patch, change: { campo: field, de, para } });
  switch (field) {
    case 'name':
      return text ? done({ name: text }, lead.name, text) : { error: 'Informe o nome.' };
    case 'phone': {
      const de = lead.phone_raw ?? lead.phone_e164;
      if (!text) return done({ phone_raw: null, phone_e164: null }, de, null);
      const digits = text.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) return { error: 'Informe o telefone com DDD.' };
      return done({ phone_raw: text, phone_e164: parseMobileInput(text, country) }, de, text);
    }
    case 'email': {
      const email = text.toLowerCase() || null;
      return email && !/^\S+@\S+\.\S+$/.test(email) ? { error: 'O e-mail não parece válido.' } : done({ email }, lead.email, email);
    }
    case 'instagram_url': {
      const url = text ? parseInstagramInput(text) : null;
      if (text && !url) return { error: 'Informe o @ ou o link do perfil do Instagram.' };
      if (url && instagramHandle(lead.instagram_url) === instagramHandle(url)) return null;
      // As imagens e a data do último post eram do perfil anterior.
      return done({ instagram_url: url, instagram_media: [], instagram_last_post_at: null }, lead.instagram_url, url);
    }
    case 'website_url': {
      const url = text ? normalizeLinkUrl(text) : null;
      if (text && !url) return { error: 'O site não parece válido.' };
      return done({ website_url: url }, lead.website_url, url);
    }
    case 'maps_url': {
      const url = text ? parseMapsUrl(text) : null;
      if (text && !url) return { error: 'Use o link do Google Maps (Compartilhar › Copiar link).' };
      // Outro link, outro lugar: o place_id volta quando o worker ler o novo.
      return done({ maps_url: url, place_id: null }, lead.maps_url ?? null, url);
    }
    default:
      return done({ [field]: text || null }, lead[field], text || null);
  }
}

export type NewLeadInput = Partial<Record<LeadField, string>>;

/** Lead novo digitado: basta um link ou o nome. Sem nome, ele vem do link até o worker achar o de verdade. */
export function newLeadFromInput(input: NewLeadInput): { row: Pick<Lead, 'name' | 'phone_raw' | 'phone_e164' | 'email' | 'instagram_url' | 'website_url' | 'business_type' | 'city' | 'address' | 'description'> & { maps_url: string | null }; provisional: boolean } | { error: string } {
  let row = {
    name: '', phone_raw: null, phone_e164: null, email: null, instagram_url: null, website_url: null,
    business_type: null, city: null, address: null, description: null, maps_url: null,
  } as unknown as Lead;
  for (const field of ['name', 'phone', 'email', 'instagram_url', 'website_url', 'maps_url', 'business_type', 'city', 'address', 'description'] as const) {
    const text = input[field]?.trim();
    if (!text) continue;
    const r = editLeadField(row, field, text);
    if (r && 'error' in r) return r;
    if (r) row = { ...row, ...r.patch };
  }
  const { instagram_media: _m, instagram_last_post_at: _p, place_id: _i, ...clean } = row as Lead;
  const provisional = !clean.name;
  if (provisional) {
    const handle = instagramHandle(clean.instagram_url);
    const host = clean.website_url ? new URL(clean.website_url).hostname.replace(/^www\./, '') : null;
    const name = handle ?? host ?? (clean.maps_url ? 'Novo lead (Google)' : null);
    if (!name) return { error: 'Preencha o nome ou um dos links (Google, Instagram ou site).' };
    clean.name = name;
  }
  return { row: clean as never, provisional };
}

/** "Nome: A → B" para o histórico. */
export function describeChange(c: LeadChange): string {
  const label = LEAD_FIELDS[c.campo] ?? c.campo;
  if (!c.de) return `${label} preenchido: ${c.para}`;
  if (!c.para) return `${label} removido (era ${c.de})`;
  return `${label}: ${c.de} → ${c.para}`;
}
