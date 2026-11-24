import { getBatch, getLead, logEvent, updateLead } from '@lps/db';
import { DEFAULT_CRITERIA, scoreLead } from '@lps/domain';
import { resolveEnrichment, resolveSite, resolveSiteInstagram } from './analyze-lead';
import { fillFromMaps, fillFromSite } from './lead-sources';
import type { Handler } from './types';

/** O link do Google ou o site foi trocado na ficha: lê de novo e atualiza a pontuação, sem mudar a etapa nem gastar com o Instagram. */
export const refreshLeadJob: Handler = async (db, job) => {
  let lead = await getLead(db, job.payload.lead_id);
  if (!lead) return;
  const site = job.payload.part === 'site';
  if (!site) {
    // Falha de uma leitura anterior não impede esta.
    const { lead: filled, error } = await fillFromMaps(db, { ...lead, error: null }, job.workspace_id, false);
    if (!error) await updateLead(db, lead.id, { error: null });
    if (error) return;
    lead = filled;
  }
  if (site || !lead.site_status) {
    lead = await resolveSite(db, lead);
    lead = await resolveSiteInstagram(db, await fillFromSite(db, lead, false), null);
    lead = await resolveEnrichment(db, lead);
    if (site) await logEvent(db, lead.id, 'site_lido');
  }
  if (lead.score === null) return;
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  const { score, reasons } = scoreLead(lead, batch?.criteria ?? DEFAULT_CRITERIA, new Date());
  await updateLead(db, lead.id, { score, score_reasons: reasons });
};
