import type { Db } from '@lps/db';

export const BUCKET = 'media';

export async function uploadMedia(db: Db, path: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeMedia(db: Db, prefix: string) {
  const { data } = await db.storage.from(BUCKET).list(prefix);
  if (data?.length) await db.storage.from(BUCKET).remove(data.map((f) => `${prefix}/${f.name}`));
}
