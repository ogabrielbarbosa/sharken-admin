'use server';

import { createContactFromLead, enqueueJob, getLead, getVideo, moveLead, NO_PHONE_MESSAGE, publishSite, saveVideo, updateLead, type Db } from '@lps/db';
import { checkVideoUpload, type Lead } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { authedDb } from '@/lib/auth';

const ORIGINALS = 'videos-originais';
type Result = { error?: string };

const refresh = () => revalidatePath('/painel', 'layout');
const gone = { error: 'Este lead não está mais em Material.' };
const stamp = () => Date.now().toString(36);

async function inMaterial(db: Db, leadId: string, stage: Lead['stage'][] = ['revisar_material']): Promise<Lead | null> {
  const lead = await getLead(db, leadId);
  return lead && stage.includes(lead.stage) ? lead : null;
}

export async function approveMaterialAction(leadId: string): Promise<Result> {
  const db = await authedDb();
  const lead = await inMaterial(db, leadId);
  if (!lead) return gone;
  if (!lead.phone_e164) return { error: NO_PHONE_MESSAGE };
  const contact = await createContactFromLead(db, lead);
  await publishSite(db, lead.id);
  await moveLead(db, lead, 'crm', {}, { contact_id: contact.id });
  refresh();
  return {};
}

export async function redoMaterialAction(leadId: string, instruction: string): Promise<Result> {
  const db = await authedDb();
  const lead = await inMaterial(db, leadId);
  if (!lead) return gone;
  const text = instruction.trim();
  if (!text) return { error: 'Escreva o que deve mudar na página.' };
  await moveLead(db, lead, 'gerando_material', { error: null, needs_data: false });
  await enqueueJob(db, { type: 'build_page', payload: { lead_id: lead.id, instruction: text }, dedupeKey: `build_page:${lead.id}:${stamp()}` });
  refresh();
  return {};
}

/** Troca a página do agente pelo template simples (o `generate_page` da v1). */
export async function useTemplateAction(leadId: string): Promise<Result> {
  const db = await authedDb();
  const lead = await inMaterial(db, leadId, ['gerando_material', 'revisar_material']);
  if (!lead) return gone;
  if (lead.stage === 'revisar_material') await moveLead(db, lead, 'gerando_material', { error: null, needs_data: false });
  else await updateLead(db, lead.id, { error: null, needs_data: false });
  await enqueueJob(db, { type: 'generate_page', payload: { lead_id: lead.id }, dedupeKey: `generate_page:${lead.id}:${stamp()}` });
  refresh();
  return {};
}

/** Tentar de novo: a página volta para o agente; se só o vídeo falhou, repete a conversão. */
export async function retryMaterialAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  if (!lead || lead.stage !== 'gerando_material') return;
  await updateLead(db, lead.id, { error: null, needs_data: false });
  await enqueueJob(db, { type: 'build_page', payload: { lead_id: lead.id }, dedupeKey: `build_page:${lead.id}:${stamp()}` });
  refresh();
}

export async function createVideoUploadUrlAction(leadId: string, fileName: string, size: number): Promise<Result & { path?: string; signedUrl?: string }> {
  const db = await authedDb();
  if (!(await inMaterial(db, leadId))) return gone;
  const check = checkVideoUpload(fileName, size);
  if (!check.ok) return { error: check.reason };
  const path = `${leadId}/${crypto.randomUUID().slice(0, 12)}.${check.ext}`;
  const { data, error } = await db.storage.from(ORIGINALS).createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível preparar o envio.' };
  return { path: data.path, signedUrl: data.signedUrl };
}

export async function confirmVideoUploadAction(leadId: string, path: string): Promise<Result> {
  const db = await authedDb();
  if (!(await inMaterial(db, leadId))) return gone;
  if (!path.startsWith(`${leadId}/`) || path.split('/').includes('..')) return { error: 'Arquivo inválido.' };
  const parent = await db.storage.from(ORIGINALS).list(leadId, { search: path.slice(leadId.length + 1) });
  if (!parent.data?.length) return { error: 'O arquivo não chegou ao servidor. Envie de novo.' };
  const current = await getVideo(db, leadId);
  await saveVideo(db, leadId, { source: 'gravado', original_path: path, status: 'convertendo', progress: 0, error: null });
  // O vídeo anterior continua guardado até a conversão do novo terminar.
  if (current?.original_path && current.original_path !== path) await db.storage.from(ORIGINALS).remove([current.original_path]);
  await enqueueJob(db, { type: 'transcode_video', payload: { lead_id: leadId }, dedupeKey: `transcode_video:${leadId}:${path.split('/').pop()}` });
  refresh();
  return {};
}

export async function retryVideoAction(leadId: string): Promise<Result> {
  const db = await authedDb();
  if (!(await inMaterial(db, leadId))) return gone;
  const video = await getVideo(db, leadId);
  if (!video?.original_path) return { error: 'Envie o vídeo de novo.' };
  await saveVideo(db, leadId, { status: 'convertendo', progress: 0, error: null });
  await enqueueJob(db, { type: 'transcode_video', payload: { lead_id: leadId }, dedupeKey: `transcode_video:${leadId}:${stamp()}` });
  refresh();
  return {};
}
