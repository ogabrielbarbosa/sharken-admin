import type { LeadAsset } from './completar';
import type { Lead } from './types';

const MAX_EXTRACTED_CHARS = 4000;

function clip(text: string): string {
  const t = text.trim();
  return t.length > MAX_EXTRACTED_CHARS ? `${t.slice(0, MAX_EXTRACTED_CHARS)}…` : t;
}

/** Tudo o que se sabe do negócio, em Markdown, para colar no Claude Desktop. */
export function buildBriefing(lead: Lead, assets: LeadAsset[]): string {
  const ready = assets.filter((a) => a.status === 'pronto');
  const out: string[] = [`# ${lead.name}`];

  const dados = [
    lead.business_type && `- Tipo de negócio: ${lead.business_type}`,
    lead.address && `- Endereço: ${lead.address}`,
    lead.city && `- Cidade: ${lead.city}`,
    lead.phone_raw && `- Telefone: ${lead.phone_raw}`,
    lead.rating != null && `- Avaliação: ${lead.rating} (${lead.reviews_count} avaliações)`,
    lead.flow && `- Fluxo: ${lead.flow === 'melhorar_site' ? 'melhorar site' : 'sem site'}`,
    lead.description && `- Descrição: ${lead.description}`,
    lead.summary && `- Resumo da análise: ${lead.summary}`,
  ].filter((l): l is string => !!l);
  out.push('', '## Dados', ...dados);

  if (lead.flow === 'melhorar_site') out.push('', '## Motivo', lead.reason?.trim() || '(não preenchido)');

  const material: string[] = [];
  for (const a of ready) {
    const text = a.kind === 'texto' ? a.body : a.extracted_text;
    if (!text?.trim()) continue;
    const title = a.kind === 'texto' ? a.label || 'Nota' : a.label || a.url || 'Arquivo';
    material.push(`### ${title}`, clip(text), '');
  }
  if (material.length) out.push('', '## Material', ...material.slice(0, -1));

  const photos = [...new Set([...ready.flatMap((a) => a.extracted_images ?? []), ...lead.photos])];
  if (photos.length) out.push('', '## Fotos', ...photos.map((u) => `- ${u}`));

  const links = [
    lead.website_url && `- Site: ${lead.website_url}`,
    lead.instagram_url && `- Instagram: ${lead.instagram_url}`,
    ...assets.filter((a) => a.kind === 'link' && a.url).map((a) => `- ${a.label ? `${a.label}: ` : ''}${a.url}`),
  ].filter((l): l is string => !!l);
  if (links.length) out.push('', '## Links', ...links);

  return `${out.join('\n')}\n`;
}
