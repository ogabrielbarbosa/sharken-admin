import type { Lead } from './types';

export function checkReadiness(lead: Pick<Lead, 'name' | 'phone_e164' | 'address' | 'categories' | 'business_type'>): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!lead.name?.trim()) missing.push('nome');
  if (!lead.phone_e164) missing.push('telefone');
  if (!lead.address?.trim()) missing.push('endereço');
  if (!lead.categories?.length && !lead.business_type) missing.push('serviço');
  return { ready: missing.length === 0, missing };
}

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
