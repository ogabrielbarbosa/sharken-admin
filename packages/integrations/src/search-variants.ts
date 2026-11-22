import { SEARCH_VARIANTS_SYSTEM } from '@lps/config';
import { generateJson } from './anthropic';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: { variants: { type: 'array', items: { type: 'string' } } },
};

/** Variações de um nicho ou de uma localização para a busca do Instagram. O Gabriel escolhe quais valem. */
export async function suggestSearchVariants(kind: 'nicho' | 'local', term: string): Promise<string[]> {
  const kindLabel = kind === 'nicho' ? 'Nicho' : 'Localização';
  const { variants } = await generateJson<{ variants: string[] }>({ system: SEARCH_VARIANTS_SYSTEM, user: `${kindLabel}: ${term}`, schema: SCHEMA });
  return [...new Set(variants.map((v) => v.replace(/["“”]/g, '').trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}
