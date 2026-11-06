import { VIDEO_ENABLED } from '@lps/config';
import { enqueueJob, getLead, getSite, logEvent, moveLead, saveSite, saveVideo, updateLead, type Db } from '@lps/db';
import { buildSiteContent, buildSourceText, checkReadiness, expiryFrom, findUnsupportedClaims, needsStockPhotos, newSiteSlug, type Lead, type SitePhoto } from '@lps/domain';
import { generatePageCopy, searchStockPhotos, uploadMedia } from '@lps/integrations';
import type { Handler } from './types';

const MAX_PHOTOS = 8;

async function copyPhoto(db: Db, url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    return await uploadMedia(db, path, Buffer.from(await res.arrayBuffer()), type);
  } catch {
    return null;
  }
}

async function collectPhotos(db: Db, lead: Lead, slug: string): Promise<SitePhoto[]> {
  const sources = [...lead.photos, ...(lead.flow === 'melhorar_site' ? lead.site_data?.images ?? [] : [])].slice(0, MAX_PHOTOS);
  const copied = await Promise.all(sources.map((url, i) => copyPhoto(db, url, `sites/${slug}/foto-${i}`)));
  const own = copied.filter((u): u is string => !!u);
  const photos: SitePhoto[] = own.map((url) => ({ url, stock: false }));
  if (!needsStockPhotos(own) || !process.env.PEXELS_API_KEY) return photos;
  try {
    const stock = await searchStockPhotos(lead.business_type ?? 'comércio local', 3 - own.length);
    return [...photos, ...stock.map((url) => ({ url, stock: true }))];
  } catch {
    return photos;
  }
}

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
