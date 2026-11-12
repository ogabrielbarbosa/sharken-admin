import { getLead, logEvent, updateLead, type Job } from '@lps/db';
import { classifyLink } from '@lps/domain';
import { probeSite } from '../site-probe';
import { resolveEnrichment } from './analyze-lead';
import type { Handler } from './types';

/**
 * Só procura contatos (site, WHOIS, CNPJ) de um lead já analisado, sem mudar a etapa.
 * Lead analisado antes do enriquecimento não tem os e-mails da página: lê o site de novo.
 */
export const enrichLeadJob: Handler = async (db, job: Job) => {
  let lead = await getLead(db, job.payload.lead_id);
  if (!lead || lead.enrichment) return;
  if (lead.site_status === 'funcionando' && classifyLink(lead.website_url).status === 'site' && !lead.site_data?.emails) {
    const probe = await probeSite(lead.website_url!).catch(() => null);
    if (probe?.result === 'ok') {
      await updateLead(db, lead.id, { site_data: probe.data });
      lead = { ...lead, site_data: probe.data };
    }
  }
  const out = await resolveEnrichment(db, lead);
  await logEvent(db, lead.id, 'enriquecido', { email: out.email, celular_novo: out.phone_e164 !== lead.phone_e164 });
};
