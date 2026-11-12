import { ANALYSIS_SYSTEM } from '@lps/config';
import { buildSourceText, type Lead, type SiteSignal } from '@lps/domain';
import { generateJson } from './anthropic';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'reason', 'franchise'],
  properties: { summary: { type: 'string' }, reason: { type: ['string', 'null'] }, franchise: { type: 'boolean' } },
};

export function buildAnalysisPrompt(lead: Lead, signals: SiteSignal[] | null): string {
  const situation = {
    sem_link: 'O negócio não tem site cadastrado.',
    somente_social: 'O negócio só tem rede social ou agregador de links.',
    fora_do_ar: 'O site cadastrado não abriu em 3 tentativas.',
    funcionando: 'O negócio tem um site funcionando.',
  }[lead.site_status ?? 'sem_link'];
  const c = lead.enrichment?.company;
  const people = (lead.enrichment?.people ?? []).slice(0, 8).map((p) => `${p.name} (${p.role})`).join('; ');
  const company = c ? [c.legal_name, c.trade_name && `nome fantasia ${c.trade_name}`, c.activity].filter(Boolean).join(', ') : '';
  const lines = [
    situation,
    `Nota ${lead.rating ?? 'sem nota'}, com ${lead.reviews_count} avaliações e ${lead.images_count} fotos.`,
    signals?.length ? `Medições do site: ${signals.map((s) => s.label).join('; ')}.` : '',
    company ? `Cadastro do CNPJ: ${company}.` : '',
    people ? `Responsáveis pelo domínio e sócios: ${people}.` : '',
    `Dados encontrados:\n<dados>\n${buildSourceText(lead)}\n</dados>`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function analyzeLead(lead: Lead): Promise<{ summary: string; reason: string | null; franchise: boolean }> {
  return generateJson({ system: ANALYSIS_SYSTEM, user: buildAnalysisPrompt(lead, lead.site_signals), schema: SCHEMA });
}
