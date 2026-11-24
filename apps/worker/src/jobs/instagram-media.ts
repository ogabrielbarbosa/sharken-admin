import { getBatch, getLead, logEvent, updateLead, type Db } from '@lps/db';
import { batchCountry, DEFAULT_CRITERIA, instagramMediaKey, latestPostAt, emailFromProfile, phoneFromProfile, pickInstagramMedia, scoreLead, type InstagramProfileData, type Lead, type InstagramMedia, type InstagramMediaProfile, type InstagramMediaSource } from '@lps/domain';
import { buildInstagramInput, INSTAGRAM_ACTOR, r2Config, runActorSync, uploadToR2, type R2Config } from '@lps/integrations';
import { apifyTokenFor, trackApifyRun, withApifyCredit } from './apify-token';
import { JobFailure, Reschedule, type Handler } from './types';

const MAX_BYTES = 15 * 1024 * 1024;

/** Baixa do Instagram (o link expira em dias) e salva no R2. Devolve null se a imagem não veio. */
async function saveOne(config: R2Config, leadId: string, item: InstagramMediaSource, index: number): Promise<InstagramMedia | null> {
  try {
    const res = await fetch(item.source, { signal: AbortSignal.timeout(20_000) });
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!res.ok || !type.startsWith('image/')) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_BYTES) return null;
    const url = await uploadToR2(config, instagramMediaKey(leadId, item, index, type), body, type);
    const { source: _source, ...rest } = item;
    return { ...rest, url };
  } catch {
    return null;
  }
}

/** O que o perfil traz de novo: último post, contatos e bio que faltavam, e a pontuação. A etapa não muda. */
async function updateFromProfile(db: Db, lead: Lead, profile: InstagramProfileData) {
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  const patch: Partial<Lead> = {};
  const last = latestPostAt(profile);
  if (last) patch.instagram_last_post_at = last;
  if (!lead.email) patch.email = emailFromProfile(profile);
  if (!lead.phone_e164) {
    const phone = phoneFromProfile(profile, batch ? batchCountry(batch) : 'BR');
    if (phone.e164) Object.assign(patch, { phone_e164: phone.e164, phone_raw: lead.phone_raw ?? phone.raw });
  }
  if (!lead.description && profile.biography?.trim()) patch.description = profile.biography.trim();
  if (lead.score !== null) {
    const { score, reasons } = scoreLead({ ...lead, ...patch }, batch?.criteria ?? DEFAULT_CRITERIA, new Date());
    Object.assign(patch, { score, score_reasons: reasons });
  }
  if (Object.keys(patch).length) await updateLead(db, lead.id, patch);
  await logEvent(db, lead.id, 'instagram_atualizado');
}

/** Lead virou Qualificado: salva no R2 a foto de perfil e as imagens dos últimos posts do Instagram. */
export const instagramMediaJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  // `refresh`: pedido na ficha do lead, lê o perfil de novo mesmo com imagens salvas.
  const refresh = job.payload.refresh === '1';
  if (!lead?.instagram_url || (lead.instagram_media?.length && !refresh)) return;

  let config: R2Config;
  try {
    config = r2Config();
  } catch {
    // Sem o R2 configurado, a tarefa espera; quando as chaves entrarem, as imagens são salvas.
    throw new Reschedule(60);
  }

  const input = buildInstagramInput([lead.instagram_url]);
  if (!input.usernames.length) throw new JobFailure('O link do Instagram não é de um perfil.');
  const token = await apifyTokenFor(job);
  const [profile] = await withApifyCredit(() => runActorSync<InstagramMediaProfile & InstagramProfileData>(token, INSTAGRAM_ACTOR, input, { onRun: trackApifyRun(job.workspace_id!, 'instagram_media', lead) }));
  if (!profile) throw new JobFailure('Não encontrei esse perfil do Instagram.');

  if (refresh) await updateFromProfile(db, lead, profile);

  const items = pickInstagramMedia(profile);
  if (!items.length) return;
  let post = 0;
  const saved = await Promise.all(items.map((item) => saveOne(config, lead.id, item, item.kind === 'perfil' ? 0 : ++post)));
  const media = saved.filter((m): m is InstagramMedia => !!m);
  if (!media.length) throw new Error('Nenhuma imagem do Instagram foi salva.');
  // O caminho no R2 é o mesmo da leitura anterior: a versão no link evita a imagem antiga do cache.
  const version = `?v=${Date.now()}`;
  await updateLead(db, lead.id, { instagram_media: refresh ? media.map((m) => ({ ...m, url: m.url + version })) : media });
};
