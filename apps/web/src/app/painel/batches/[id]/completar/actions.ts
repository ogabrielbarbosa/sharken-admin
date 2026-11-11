'use server';

import { addAsset, deleteAsset, enqueueJob, getAsset, getLead, listAssets, listLeads, moveLead, updateAsset, updateLead, type Db } from '@lps/db';
import { canGenerateMaterial, canTransition, isAcceptedMime, MAX_ASSET_BYTES, nextPending, normalizeLinkUrl, sanitizeFileName, type Lead } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';

const BUCKET = 'lead-assets';
type Result = { error?: string };

/** O lead precisa existir e ainda estar em Completar; com `batchId`, também ser daquele batch. */
async function completing(db: Db, leadId: string, batchId?: string): Promise<Lead | null> {
  const lead = await getLead(db, leadId);
  if (!lead || lead.stage !== 'completar') return null;
  if (batchId && lead.batch_id !== batchId) return null;
  return lead;
}

const gone = { error: 'Este lead não está mais em Completar.' };
const refresh = () => revalidatePath('/painel', 'layout');

export async function addLinkAction(leadId: string, rawUrl: string, label?: string): Promise<Result> {
  const db = await authedDb();
  if (!(await completing(db, leadId))) return gone;
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return { error: 'Esse link não parece válido.' };
  const asset = await addAsset(db, { lead_id: leadId, kind: 'link', url, label: label?.trim() || null });
  await enqueueJob(db, { type: 'extract_asset', payload: { asset_id: asset.id }, dedupeKey: `extract_asset:${asset.id}` });
  refresh();
  return {};
}

/** Notas para a página: um único item de texto por lead. Vazio remove. */
export async function addTextAction(leadId: string, text: string): Promise<Result> {
  const db = await authedDb();
  if (!(await completing(db, leadId))) return gone;
  const existing = (await listAssets(db, leadId)).find((a) => a.kind === 'texto');
  const body = text.trim();
  if (!body) {
    if (existing) await deleteAsset(db, existing.id);
  } else if (existing) {
    await updateAsset(db, existing.id, { body, extracted_text: body, status: 'pronto', error: null });
  } else {
    const asset = await addAsset(db, { lead_id: leadId, kind: 'texto', label: 'Notas para a página', body });
    await updateAsset(db, asset.id, { extracted_text: body, status: 'pronto' });
  }
  refresh();
  return {};
}

export async function createUploadUrlAction(leadId: string, fileName: string, mime: string, size: number): Promise<Result & { path?: string; signedUrl?: string }> {
  const db = await authedDb();
  if (!(await completing(db, leadId))) return gone;
  if (size > MAX_ASSET_BYTES) return { error: 'Arquivo grande demais. O limite é 20 MB.' };
  if (size <= 0) return { error: 'O arquivo está vazio.' };
  if (!isAcceptedMime(mime)) return { error: 'Tipo não aceito. Use PDF, imagem, Word ou texto.' };
  const path = `${leadId}/${crypto.randomUUID().slice(0, 8)}-${sanitizeFileName(fileName)}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível preparar o envio.' };
  return { path: data.path, signedUrl: data.signedUrl };
}

export async function confirmUploadAction(leadId: string, path: string, fileName: string, mime: string): Promise<Result> {
  const db = await authedDb();
  if (!(await completing(db, leadId))) return gone;
  if (!path.startsWith(`${leadId}/`) || path.split('/').includes('..') || !isAcceptedMime(mime)) return { error: 'Arquivo inválido.' };
  const asset = await addAsset(db, { lead_id: leadId, kind: 'arquivo', storage_path: path, mime_type: mime, label: fileName });
  await enqueueJob(db, { type: 'extract_asset', payload: { asset_id: asset.id }, dedupeKey: `extract_asset:${asset.id}` });
  refresh();
  return {};
}

export async function removeAssetAction(assetId: string): Promise<Result> {
  const db = await authedDb();
  const asset = await getAsset(db, assetId);
  if (!asset || !(await completing(db, asset.lead_id))) return gone;
  if (asset.storage_path) await db.storage.from(BUCKET).remove([asset.storage_path]);
  await deleteAsset(db, assetId);
  refresh();
  return {};
}

export async function retryAssetAction(assetId: string): Promise<Result> {
  const db = await authedDb();
  const asset = await getAsset(db, assetId);
  if (!asset || !(await completing(db, asset.lead_id))) return gone;
  await updateAsset(db, assetId, { status: 'extraindo', error: null });
  await enqueueJob(db, { type: 'extract_asset', payload: { asset_id: assetId }, dedupeKey: `extract_asset:${assetId}` });
  refresh();
  return {};
}

export async function saveLeadFieldAction(leadId: string, field: 'reason' | 'comment', value: string): Promise<Result> {
  if (field !== 'reason' && field !== 'comment') return { error: 'Campo inválido.' };
  const db = await authedDb();
  if (!(await completing(db, leadId))) return gone;
  await updateLead(db, leadId, { [field]: value });
  return {};
}

const base = (batchId: string) => `/painel/batches/${batchId}/completar`;

/** Sem `ids` na URL, a fila é o conjunto de leads do batch em Completar. */
async function nextInQueue(db: Db, batchId: string, currentId: string, ids: string[]): Promise<string | null> {
  const pending = await listLeads(db, batchId, ['completar']);
  const order = ids.length ? ids : pending.map((l) => l.id);
  return nextPending(order, currentId, new Set(pending.map((l) => l.id)));
}

function queueUrl(batchId: string, ids: string[], leadId: string | null) {
  const params = new URLSearchParams();
  if (ids.length) params.set('ids', ids.join(','));
  if (leadId) params.set('lead', leadId);
  const qs = params.toString();
  return qs ? `${base(batchId)}?${qs}` : base(batchId);
}

const idsOf = (form: FormData) => String(form.get('ids') ?? '').split(',').filter(Boolean);

export async function generateMaterialAction(leadId: string, batchId: string, ids: string[]): Promise<Result> {
  const db = await authedDb();
  const lead = await completing(db, leadId, batchId);
  if (!lead || !canTransition('completar', 'gerando_material')) return gone;
  const check = canGenerateMaterial(lead, await listAssets(db, leadId));
  if (!check.ok) return { error: check.reason };
  await moveLead(db, lead, 'gerando_material', { error: null });
  await enqueueJob(db, { type: 'build_page', payload: { lead_id: leadId }, dedupeKey: `build_page:${leadId}` });
  refresh();
  const next = await nextInQueue(db, batchId, leadId, ids);
  redirect(next ? queueUrl(batchId, ids, next) : `/painel/batches/${batchId}/material`);
}

export async function skipAction(form: FormData) {
  const db = await authedDb();
  const leadId = String(form.get('leadId'));
  const batchId = String(form.get('batchId'));
  const ids = idsOf(form);
  if (!(await completing(db, leadId, batchId))) return;
  const next = await nextInQueue(db, batchId, leadId, ids);
  if (next) redirect(queueUrl(batchId, ids, next));
}
