import { randomUUID } from 'node:crypto';
import { AVATAR_MAX_BYTES, avatarMime, type MemberProfile } from '@lps/domain';
import type { Db } from './client';

export const AVATARS_BUCKET = 'avatars';
const SIGNED_SECONDS = 24 * 3600;

/** Perfis dos usuários pedidos, com a foto já assinada. Quem não tem perfil fica fora do mapa. */
export async function listProfiles(db: Db, userIds: string[]): Promise<Map<string, MemberProfile>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { data, error } = await db.from('user_profiles').select('user_id, name, avatar_path').in('user_id', ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { user_id: string; name: string | null; avatar_path: string | null }[];
  const paths = rows.flatMap((r) => (r.avatar_path ? [r.avatar_path] : []));
  const signed = paths.length ? (await db.storage.from(AVATARS_BUCKET).createSignedUrls(paths, SIGNED_SECONDS)).data ?? [] : [];
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return new Map(rows.map((r) => [r.user_id, { userId: r.user_id, name: r.name, avatarUrl: (r.avatar_path && urls.get(r.avatar_path)) || null }]));
}

/** Para telas em que o perfil é só enfeite: sem ele, aparecem o e-mail e as iniciais. */
export async function profilesOrEmpty(db: Db, userIds: string[]): Promise<Map<string, MemberProfile>> {
  try {
    return await listProfiles(db, userIds);
  } catch (err) {
    console.error('perfis_falharam', (err as Error).message);
    return new Map();
  }
}

/** Grava só o que veio: salvar o nome não mexe na foto. */
export async function saveProfile(db: Db, userId: string, patch: { name?: string; avatarPath?: string | null }): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.avatarPath !== undefined) row.avatar_path = patch.avatarPath;
  const { error } = await db.from('user_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/** Caminho da foto atual, para apagar o arquivo depois da troca. */
export async function avatarPathOf(db: Db, userId: string): Promise<string | null> {
  const { data, error } = await db.from('user_profiles').select('avatar_path').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { avatar_path: string | null } | null)?.avatar_path ?? null;
}

/** Sobe a foto num caminho novo (a URL muda, sem cache da antiga). Não altera o perfil. */
export async function uploadAvatar(db: Db, userId: string, bytes: Uint8Array): Promise<string> {
  const mime = avatarMime(bytes);
  if (!mime || bytes.byteLength > AVATAR_MAX_BYTES) throw new Error('Envie uma imagem JPG, PNG ou WebP de até 2 MB.');
  const path = `${userId}/${randomUUID()}`;
  const { error } = await db.storage.from(AVATARS_BUCKET).upload(path, bytes, { contentType: mime });
  if (error) throw new Error(`Falha ao guardar a foto: ${error.message}`);
  return path;
}

export async function removeAvatar(db: Db, path: string): Promise<void> {
  await db.storage.from(AVATARS_BUCKET).remove([path]);
}
