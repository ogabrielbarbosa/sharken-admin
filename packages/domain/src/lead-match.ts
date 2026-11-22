import type { NewLead } from './apify-mapper';
import { mergeLeadOnReimport } from './lead-import';
import { instagramHandle, siteDomain } from './lead-keys';
import type { Lead } from './types';

/** Chaves fortes: uma igual basta para ser o mesmo negócio. */
export type LeadKeys = { place_id: string | null; instagram_handle: string | null; site_domain: string | null; phone_e164: string | null };

export function keysOf(l: { place_id?: string | null; instagram_url?: string | null; website_url?: string | null; phone_e164?: string | null }): LeadKeys {
  return { place_id: l.place_id ?? null, instagram_handle: instagramHandle(l.instagram_url), site_domain: siteDomain(l.website_url), phone_e164: l.phone_e164 ?? null };
}

/** Dois lugares diferentes no Maps, ou dois perfis diferentes no Instagram, não são o mesmo negócio. */
export function keysConflict(a: LeadKeys, b: LeadKeys): boolean {
  return (!!a.place_id && !!b.place_id && a.place_id !== b.place_id)
    || (!!a.instagram_handle && !!b.instagram_handle && a.instagram_handle !== b.instagram_handle);
}

/**
 * O lead existente que é o mesmo negócio, pela chave mais confiável: place_id, @ do Instagram, domínio, telefone.
 * Telefone usado por mais de um lead (central, franquia) não conta.
 */
export function findMatch<T extends LeadKeys>(incoming: LeadKeys, candidates: T[], sharedPhones: ReadonlySet<string> = new Set()): T | null {
  const ok = candidates.filter((c) => !keysConflict(incoming, c));
  const by = (key: keyof LeadKeys) => (incoming[key] ? ok.find((c) => c[key] === incoming[key]) ?? null : null);
  return by('place_id') ?? by('instagram_handle') ?? by('site_domain')
    ?? (incoming.phone_e164 && !sharedPhones.has(incoming.phone_e164) ? by('phone_e164') : null);
}

/** Telefones que aparecem em mais de um lead. */
export function sharedPhonesOf(leads: { phone_e164: string | null }[]): Set<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const { phone_e164: p } of leads) {
    if (!p) continue;
    if (seen.has(p)) shared.add(p);
    seen.add(p);
  }
  return shared;
}

/**
 * O que o lead existente ganha quando outra fonte o acha de novo. Campo vazio é preenchido; os números do Maps
 * (nota, avaliações, fotos) vêm do Maps; a data do último post fica com a mais recente. Etapa e andamento não mudam.
 */
export function mergeIncoming(existing: Lead, incoming: NewLead): Partial<Lead> {
  const patch: Partial<Lead> = incoming.place_id ? mergeLeadOnReimport(existing, incoming) : {};
  const fill = <K extends keyof Lead & keyof NewLead>(key: K) => {
    const value = incoming[key];
    const current = existing[key];
    const empty = current === null || current === undefined || current === '' || (Array.isArray(current) && !current.length);
    const has = value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);
    if (empty && has) (patch as Record<string, unknown>)[key] = value;
  };
  for (const key of ['place_id', 'phone_raw', 'phone_e164', 'address', 'city', 'website_url', 'instagram_url', 'email', 'business_type', 'description', 'categories'] as const) fill(key);
  if (incoming.instagram_last_post_at && (!existing.instagram_last_post_at || incoming.instagram_last_post_at > existing.instagram_last_post_at)) {
    patch.instagram_last_post_at = incoming.instagram_last_post_at;
  }
  return patch;
}

// --- Chave fraca: nome parecido na mesma cidade ---

/** Palavras do ramo que não diferenciam um negócio do outro. */
const GENERIC = new Set([
  'clinica', 'consultorio', 'odontologia', 'odontologica', 'odonto', 'dentista', 'dra', 'dr', 'de', 'da', 'do', 'das', 'dos',
  'e', 'a', 'o', 'estudio', 'studio', 'espaco', 'centro', 'instituto', 'ltda', 'me', 'eireli', 'sjc', 'oficial',
]);

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');

/** Nome sem acento, sem pontuação e sem as palavras genéricas do ramo. */
export function nameCore(name: string): string {
  const words = plain(name).split(/\s+/).filter(Boolean);
  const core = words.filter((w) => !GENERIC.has(w));
  return (core.length ? core : words).join(' ');
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(' ').filter(Boolean)) {
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Semelhança de 0 a 1 entre dois textos (trigramas, como o pg_trgm), sem acento e caixa. */
export function textSimilarity(a: string, b: string): number {
  const ta = trigrams(plain(a).trim());
  const tb = trigrams(plain(b).trim());
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}

export const DUPLICATE_THRESHOLD = 0.5;

export type DuplicateCandidate = LeadKeys & { id: string; name: string; city: string | null };

/** Pares que podem ser o mesmo negócio: mesma cidade, nome parecido e nenhuma chave forte que os separe. */
export function possibleDuplicates<T extends DuplicateCandidate>(leads: T[], dismissed: ReadonlySet<string> = new Set()): { a: T; b: T; similarity: number }[] {
  const byCity = new Map<string, T[]>();
  for (const l of leads) {
    if (!l.city) continue;
    const key = plain(l.city).trim();
    byCity.set(key, [...(byCity.get(key) ?? []), l]);
  }
  const out: { a: T; b: T; similarity: number }[] = [];
  for (const group of byCity.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        if (dismissed.has(pairKey(a.id, b.id)) || keysConflict(a, b)) continue;
        // Mesma chave forte já teria sido juntada na importação; aqui só os casos de dúvida.
        const similarity = textSimilarity(nameCore(a.name), nameCore(b.name));
        if (similarity >= DUPLICATE_THRESHOLD) out.push({ a, b, similarity });
      }
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

/** Chave do par, na mesma ordem dos dois lados. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
