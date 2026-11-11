import type { Lead } from './types';

/** Texto com tudo o que foi encontrado sobre o negócio. O comentário interno fica de fora. */
export function buildSourceText(lead: Lead): string {
  const parts = [
    lead.name,
    lead.business_type,
    ...lead.categories,
    lead.city,
    lead.address,
    lead.description,
    ...lead.reviews.map((r) => r.text),
    lead.site_data?.title,
    lead.site_data?.description,
    ...(lead.site_data?.headings ?? []),
    lead.site_data?.text,
  ];
  return parts.filter(Boolean).join('\n');
}
