import { ANALYSIS_SYSTEM } from '@lps/config';
import { buildSourceText, type Lead, type SiteSignal } from '@lps/domain';
import { generateJson } from './anthropic';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'reason'],
  properties: { summary: { type: 'string' }, reason: { type: ['string', 'null'] } },
};

export function buildAnalysisPrompt(lead: Lead, signals: SiteSignal[] | null): string {
  const situation = {
    sem_link: 'O negócio não tem site cadastrado.',
    somente_social: 'O negócio só tem rede social ou agregador de links.',
    fora_do_ar: 'O site cadastrado não abriu em 3 tentativas.',
    funcionando: 'O negócio tem um site funcionando.',
  }[lead.site_status ?? 'sem_link'];
  const lines = [
    situation,
    `Nota ${lead.rating ?? 'sem nota'}, com ${lead.reviews_count} avaliações e ${lead.images_count} fotos.`,
    signals?.length ? `Medições do site: ${signals.map((s) => s.label).join('; ')}.` : '',
    `Dados encontrados:\n<dados>\n${buildSourceText(lead)}\n</dados>`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function analyzeLead(lead: Lead): Promise<{ summary: string; reason: string | null }> {
  return generateJson({ system: ANALYSIS_SYSTEM, user: buildAnalysisPrompt(lead, lead.site_signals), schema: SCHEMA });
}
