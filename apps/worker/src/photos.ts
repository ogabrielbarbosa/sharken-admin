import type { Db } from '@lps/db';
import { needsStockPhotos, type Lead, type SitePhoto } from '@lps/domain';
import { searchStockPhotos, uploadMedia } from '@lps/integrations';

const MAX_PHOTOS = 8;
const ASSETS_BUCKET = 'lead-assets';

/** Baixa a imagem e sobe para o bucket público `media`. Devolve a URL pública, ou null se não for imagem. */
export async function copyPhoto(db: Db, url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    return await uploadMedia(db, path, Buffer.from(await res.arrayBuffer()), type);
  } catch {
    return null;
  }
}

/** Fotos do Google e, no fluxo melhorar_site, as do site atual, já copiadas para `sites/<slug>/`. */
export async function copyLeadPhotos(db: Db, lead: Lead, slug: string): Promise<string[]> {
  const sources = [...lead.photos, ...(lead.flow === 'melhorar_site' ? lead.site_data?.images ?? [] : [])].slice(0, MAX_PHOTOS);
  const copied = await Promise.all(sources.map((url, i) => copyPhoto(db, url, `sites/${slug}/foto-${i}`)));
  return copied.filter((u): u is string => !!u);
}

/** Imagens extraídas em Completar (bucket privado `lead-assets`), copiadas para o bucket público. */
export async function copyAssetImages(db: Db, paths: string[], slug: string): Promise<string[]> {
  const copied = await Promise.all(
    paths.slice(0, MAX_PHOTOS).map(async (path, i) => {
      try {
        const { data, error } = await db.storage.from(ASSETS_BUCKET).download(path);
        if (error || !data || !data.type.startsWith('image/') || data.type === 'image/svg+xml') return null;
        return await uploadMedia(db, `sites/${slug}/material-${i}`, Buffer.from(await data.arrayBuffer()), data.type);
      } catch {
        return null;
      }
    }),
  );
  return copied.filter((u): u is string => !!u);
}

/** Fotos do template simples: as próprias e, com menos de 3, fotos de banco. */
export async function collectPhotos(db: Db, lead: Lead, slug: string): Promise<SitePhoto[]> {
  const own = await copyLeadPhotos(db, lead, slug);
  const photos: SitePhoto[] = own.map((url) => ({ url, stock: false }));
  if (!needsStockPhotos(own) || !process.env.PEXELS_API_KEY) return photos;
  try {
    const stock = await searchStockPhotos(lead.business_type ?? 'comércio local', 3 - own.length);
    return [...photos, ...stock.map((url) => ({ url, stock: true }))];
  } catch {
    return photos;
  }
}
