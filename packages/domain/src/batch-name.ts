import { PROFILE_BATCH_NICHE, relationsLabel } from './instagram-network';
import { MANUAL_LOCATION } from './manual-lead';
import type { Batch } from './types';

type Named = { name?: string | null; location: string; business_type: string };

/** Nome do batch: o escolhido ou, sem ele, o tipo de negócio e o lugar (ou só o @, no batch de um perfil). */
export const batchName = (b: Named): string =>
  b.name?.trim() || (b.business_type === PROFILE_BATCH_NICHE ? b.location : [b.business_type, b.location].filter(Boolean).join(' · '));

export const BATCH_SOURCE_LABEL: Record<Batch['source'], string> = { instagram: 'Instagram', maps: 'Google Maps', instagram_profile: 'Perfil do Instagram', manual: 'Manual' };

/** Há batch manual gravado com outra fonte no banco: o local identifica. */
export const batchSource = (b: Pick<Batch, 'source' | 'location'>): Batch['source'] => (b.location === MANUAL_LOCATION ? 'manual' : b.source);

/** De onde vieram os leads, embaixo da fonte: as cidades, ou o perfil e as listas puxadas dele. */
export function batchSourceDetail(b: Pick<Batch, 'source' | 'location' | 'locations' | 'source_profile' | 'source_relations'>): string {
  const source = batchSource(b);
  if (source === 'manual') return '';
  if (source === 'instagram_profile') return `@${b.source_profile} · ${relationsLabel(b.source_relations ?? [])}`;
  const cities = b.locations?.length ? b.locations : [b.location];
  return cities.length > 2 ? `${cities[0]} e mais ${cities.length - 1} cidades` : cities.join(' e ');
}
