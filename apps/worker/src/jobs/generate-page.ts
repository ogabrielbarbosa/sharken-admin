import { VIDEO_ENABLED } from '@lps/config';
import { enqueueJob, getLead, getSite, logEvent, moveLead, saveSite, saveVideo, updateLead } from '@lps/db';
import { buildSiteContent, buildSourceText, checkReadiness, expiryFrom, findUnsupportedClaims, newSiteSlug } from '@lps/domain';
import { generatePageCopy } from '@lps/integrations';
import { collectPhotos } from '../photos';
import type { Handler } from './types';

export const generatePageJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  if (!lead || lead.stage !== 'gerando_material') return;

  const readiness = checkReadiness(lead);
  if (!readiness.ready) {
    await updateLead(db, lead.id, { needs_data: true, error: `Faltam dados: ${readiness.missing.join(', ')}` });
    return;
  }

  const flow = lead.flow ?? 'sem_site';
  const copy = await generatePageCopy(lead, flow);
  const unsupported = findUnsupportedClaims(copy, buildSourceText(lead));
  if (unsupported.length) throw new Error(`Texto com afirmações sem apoio nos dados: ${unsupported.join(', ')}`);

  const existing = await getSite(db, lead.id);
  const slug = existing?.slug ?? newSiteSlug();
  const content = buildSiteContent(lead, copy, await collectPhotos(db, lead, slug));
  await saveSite(db, { lead_id: lead.id, slug, content, expires_at: expiryFrom(new Date()).toISOString() });
  await updateLead(db, lead.id, { needs_data: false, error: null });
  await logEvent(db, lead.id, 'pagina_gerada');

  if (VIDEO_ENABLED[flow]) {
    await saveVideo(db, lead.id, { status: 'na_fila', progress: 0, error: null });
    await enqueueJob(db, { type: 'render_video', payload: { lead_id: lead.id }, dedupeKey: `render_video:${lead.id}` });
    return;
  }
  await moveLead(db, lead, 'revisar_material');
};

generatePageJob.onFailure = async (db, job, message) => {
  await updateLead(db, job.payload.lead_id, { error: message });
  await logEvent(db, job.payload.lead_id, 'erro_pagina', { message });
};
