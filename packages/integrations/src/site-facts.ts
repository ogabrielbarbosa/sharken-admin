import { SITE_FACTS_SYSTEM } from '@lps/config';
import type { SiteData } from '@lps/domain';
import { generateJson } from './anthropic';

export type SiteFacts = { name: string | null; business_type: string | null; city: string | null; address: string | null; phone: string | null };
const text = { type: ['string', 'null'] };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'business_type', 'city', 'address', 'phone'],
  properties: { name: text, business_type: text, city: text, address: text, phone: text },
};

/** Dados do negócio escritos no próprio site (só o que está lá). */
export function extractSiteFacts(url: string, data: SiteData): Promise<SiteFacts> {
  const user = [`Endereço: ${url}`, `Título: ${data.title ?? ''}`, `Descrição: ${data.description ?? ''}`, `Títulos: ${data.headings.join(' | ')}`, `Texto:\n<site>\n${data.text}\n</site>`].join('\n');
  return generateJson<SiteFacts>({ system: SITE_FACTS_SYSTEM, user, schema: SCHEMA });
}
