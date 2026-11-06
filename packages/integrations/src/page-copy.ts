import { PAGE_COPY_SYSTEM } from '@lps/config';
import { buildSourceText, type Flow, type Lead, type PageCopy } from '@lps/domain';
import { generateJson } from './anthropic';

const nullableString = { type: ['string', 'null'] };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'subheadline', 'about', 'services', 'cta'],
  properties: {
    headline: { type: 'string' },
    subheadline: { type: 'string' },
    about: nullableString,
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: { name: { type: 'string' }, description: nullableString },
      },
    },
    cta: { type: 'string' },
  },
};

export function generatePageCopy(lead: Lead, flow: Flow): Promise<PageCopy> {
  const context = flow === 'melhorar_site' ? 'O negócio tem um site atual, e a página é uma versão nova dele.' : 'O negócio não tem um site funcionando.';
  return generateJson<PageCopy>({
    system: PAGE_COPY_SYSTEM,
    user: `${context}\n\nDados encontrados:\n<dados>\n${buildSourceText(lead)}\n</dados>`,
    schema: SCHEMA,
  });
}
