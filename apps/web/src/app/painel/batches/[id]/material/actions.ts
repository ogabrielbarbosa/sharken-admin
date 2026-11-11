'use server';

import { enqueueJob, getLead, getSite, getVideo, moveLead, saveVideo, updateLead } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { authedDb } from '@/lib/auth';

const refresh = () => revalidatePath('/painel', 'layout');

export async function approveMaterialAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (lead) await moveLead(db, lead, 'crm');
  refresh();
}

export async function redoMaterialAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead) return;
  await moveLead(db, lead, 'gerando_material', { error: null });
  await enqueueJob(db, { type: 'generate_page', payload: { lead_id: lead.id }, dedupeKey: `generate_page:${lead.id}` });
  refresh();
}

export async function retryMaterialAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead || lead.stage !== 'gerando_material') return;
  await updateLead(db, lead.id, { error: null, needs_data: false });
  const [site, video] = await Promise.all([getSite(db, lead.id), getVideo(db, lead.id)]);
  if (site && video?.status === 'erro') {
    await saveVideo(db, lead.id, { status: 'na_fila', progress: 0, error: null });
    await enqueueJob(db, { type: 'render_video', payload: { lead_id: lead.id }, dedupeKey: `render_video:${lead.id}` });
  } else {
    await enqueueJob(db, { type: 'generate_page', payload: { lead_id: lead.id }, dedupeKey: `generate_page:${lead.id}` });
  }
  refresh();
}
