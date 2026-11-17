import { getLead, updateLead } from '@lps/db';
import { instagramMediaKey, pickInstagramMedia, type InstagramMedia, type InstagramMediaProfile, type InstagramMediaSource } from '@lps/domain';
import { buildInstagramInput, INSTAGRAM_ACTOR, r2Config, runActorSync, uploadToR2, type R2Config } from '@lps/integrations';
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

/** Lead virou Qualificado: salva no R2 a foto de perfil e as imagens dos últimos posts do Instagram. */
export const instagramMediaJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  if (!lead?.instagram_url || lead.instagram_media?.length) return;

  let config: R2Config;
  try {
    config = r2Config();
  } catch {
    // Sem o R2 configurado, a tarefa espera; quando as chaves entrarem, as imagens são salvas.
    throw new Reschedule(60);
  }

  const input = buildInstagramInput([lead.instagram_url]);
  if (!input.usernames.length) throw new JobFailure('O link do Instagram não é de um perfil.');
  const [profile] = await runActorSync<InstagramMediaProfile>(INSTAGRAM_ACTOR, input);
  if (!profile) throw new JobFailure('Não encontrei esse perfil do Instagram.');

  const items = pickInstagramMedia(profile);
  if (!items.length) return;
  let post = 0;
  const saved = await Promise.all(items.map((item) => saveOne(config, lead.id, item, item.kind === 'perfil' ? 0 : ++post)));
  const media = saved.filter((m): m is InstagramMedia => !!m);
  if (!media.length) throw new Error('Nenhuma imagem do Instagram foi salva.');
  await updateLead(db, lead.id, { instagram_media: media });
};
