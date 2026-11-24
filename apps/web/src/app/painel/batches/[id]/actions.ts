'use server';

import {
  addAsset, addContactToLead, addManualLead, completeInfo, deleteAsset, deleteBatch, enqueueJob, getAsset, getBatch, getLead, listAssets, moveLead, qualifyLeads,
  savePageUrl, saveLoomUrl, STALE, setResponsible, stepBack, saveLeadNote, updateAsset, type Db, type PipelineResult,
} from '@lps/db';
import { canTransition, isAcceptedMime, manualLead, toMobileE164, MAX_ASSET_BYTES, normalizeLinkUrl, sanitizeFileName, type Lead } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb, getSession } from '@/lib/auth';

const BUCKET = 'lead-assets';
type Result = { error?: string };

/** O lead precisa existir e ainda estar em Qualificado (`completar`). */
async function completing(db: Db, leadId: string): Promise<Lead | null> {
  const lead = await getLead(db, leadId);
  return lead && lead.stage === 'completar' ? lead : null;
}

const gone = { error: 'Este lead não está mais em Qualificado.' };
const refresh = () => revalidatePath('/painel', 'layout');

// ── Batch ───────────────────────────────────────────────────────────────

/** Apaga o batch e os leads dele que não chegaram ao CRM, e volta para a lista. */
export async function deleteBatchAction(batchId: string): Promise<Result> {
  const db = await authedDb();
  try {
    const { storagePaths } = await deleteBatch(db, batchId);
    if (storagePaths.length) await db.storage.from(BUCKET).remove(storagePaths);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível apagar o batch.' };
  }
  refresh();
  redirect('/painel/batches');
}

/** Batch manual: cadastra um lead e manda para a análise. `notice` quando o negócio já era conhecido. */
export async function addManualLeadAction(batchId: string, form: FormData): Promise<Result & { notice?: string }> {
  const db = await authedDb();
  const batch = await getBatch(db, batchId);
  if (batch?.source !== 'manual') return { error: 'Só batches manuais aceitam leads cadastrados à mão.' };
  const field = (k: string) => String(form.get(k) ?? '');
  const parsed = manualLead({
    name: field('name'), businessType: field('businessType'), phone: field('phone'), email: field('email'), instagram: field('instagram'),
    website: field('website'), city: field('city'), address: field('address'), description: field('description'),
  }, batch);
  if ('error' in parsed) return parsed;
  let known: boolean;
  try {
    ({ known } = await addManualLead(db, parsed.lead));
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível adicionar o lead.' };
  }
  refresh();
  return known ? { notice: 'Esse negócio já existia. Ele aparece neste batch na etapa em que já estava, com os dados que faltavam.' } : {};
}

// ── Etapas ──────────────────────────────────────────────────────────────

/** Novo lead → Qualificado. Quem já saiu de Novo lead fica como está. */
export async function qualifyAction(ids: string[]): Promise<PipelineResult> {
  const db = await authedDb();
  const { moved } = await qualifyLeads(db, ids);
  refresh();
  if (!moved) return { ok: false, error: STALE };
  return moved < ids.length ? { ok: true, warning: `${ids.length - moved} já tinham mudado de etapa.` } : { ok: true };
}

/** Descarta os leads escolhidos. A transição é conferida para cada um. */
export async function discardAction(ids: string[]): Promise<PipelineResult> {
  const db = await authedDb();
  let moved = 0;
  for (const id of ids) {
    const lead = await getLead(db, id);
    if (!lead || !canTransition(lead.stage, 'descartado')) continue;
    await moveLead(db, lead, 'descartado', { exit_reason: 'Descartado por você' });
    moved += 1;
  }
  refresh();
  if (!moved) return { ok: false, error: STALE };
  return moved < ids.length ? { ok: true, warning: `${ids.length - moved} já tinham mudado de etapa.` } : { ok: true };
}

export async function completeInfoAction(leadId: string): Promise<PipelineResult> {
  const result = await completeInfo(await authedDb(), leadId);
  refresh();
  return result;
}

export async function savePageUrlAction(leadId: string, url: string): Promise<PipelineResult> {
  const result = await savePageUrl(await authedDb(), leadId, url);
  refresh();
  return result;
}

export async function saveLoomUrlAction(leadId: string, url: string): Promise<PipelineResult> {
  const result = await saveLoomUrl(await authedDb(), leadId, url, (await getSession()).user.id);
  refresh();
  return result;
}

export async function stepBackAction(leadId: string, from: 'pagina' | 'video'): Promise<PipelineResult> {
  if (from !== 'pagina' && from !== 'video') return { ok: false, error: STALE };
  const result = await stepBack(await authedDb(), leadId, from);
  refresh();
  return result;
}

/** Responsável pelo lead; nulo deixa sem ninguém. */
export async function setLeadResponsibleAction(leadId: string, userId: string | null): Promise<PipelineResult> {
  const db = await authedDb();
  const { user } = await getSession();
  try {
    await setResponsible(db, 'leads', leadId, userId, user.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Não foi possível trocar o responsável.' };
  }
  refresh();
  return { ok: true };
}

// ── Itens do lead em Qualificado ────────────────────────────────────────

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
  await saveLeadNote(db, leadId, field, value, (await getSession()).user.id);
  refresh();
  return {};
}

// ── Contatos do lead ────────────────────────────────────────────────────

/** Mais um número do mesmo negócio: vira outra conversa no CRM, ligada a este lead. */
export async function addLeadContactAction(leadId: string, name: string, phone: string): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const db = await authedDb();
  const cleanName = name.trim();
  if (!cleanName) return { ok: false, error: 'Informe o nome.' };
  const mobile = toMobileE164(phone);
  if (!mobile) return { ok: false, error: 'Informe um celular válido, com DDD.' };
  try {
    const contact = await addContactToLead(db, leadId, { name: cleanName, phone_e164: mobile }, (await getSession()).user.id);
    refresh();
    return { ok: true, contactId: contact.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Não foi possível adicionar o número.' };
  }
}
