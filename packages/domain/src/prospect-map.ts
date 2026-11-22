import { textSimilarity } from './lead-match';
import { municipioGeo } from './municipios';
import type { Batch } from './types';

export type ProspectedBatch = { id: string; business_type: string; created_at: string; leads: number };
export type ProspectedCity = { location: string; lat: number; lng: number; batches: ProspectedBatch[]; leads: number };

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Mesmo nicho escrito de jeitos diferentes ("Lente dental", "lente dental ") conta como um. */
export const nicheKey = plain;

/** "lente dental" e "lentes dentais" são o mesmo nicho (mesmo critério das variações salvas). */
export const sameNiche = (a: string, b: string) => nicheKey(a) === nicheKey(b) || textSimilarity(a, b) >= 0.45;

/**
 * Onde já houve batch: cada cidade com os batches que passaram por ela e quantos leads cada um achou.
 * Batch com várias cidades aparece em todas. Cidade fora da lista do IBGE (batches antigos com texto livre) fica de fora.
 */
export function prospectedCities(
  batches: Pick<Batch, 'id' | 'location' | 'locations' | 'business_type' | 'created_at'>[],
  leadsByBatch: Record<string, number>,
  niche?: string,
): ProspectedCity[] {
  const byCity = new Map<string, ProspectedCity>();
  for (const b of batches) {
    if (niche && !sameNiche(b.business_type, niche)) continue;
    for (const location of b.locations?.length ? b.locations : [b.location]) {
      const geo = municipioGeo(location);
      if (!geo) continue;
      const city = byCity.get(location) ?? { location, lat: geo.lat, lng: geo.lng, batches: [], leads: 0 };
      const leads = leadsByBatch[b.id] ?? 0;
      city.batches.push({ id: b.id, business_type: b.business_type, created_at: b.created_at, leads });
      city.leads += leads;
      byCity.set(location, city);
    }
  }
  return [...byCity.values()].sort((a, b) => b.leads - a.leads);
}

/** Nichos já buscados, sem repetir (vale a grafia do batch mais recente da lista). */
export function prospectedNiches(batches: Pick<Batch, 'business_type'>[]): string[] {
  return [...new Map(batches.map((b) => [nicheKey(b.business_type), b.business_type.trim()])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
