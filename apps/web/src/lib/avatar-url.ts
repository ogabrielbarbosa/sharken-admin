import { createUrlCache } from './media-cache';

// A URL assinada muda a cada refresh: guardar a primeira evita a foto piscar.
const urlCache = createUrlCache(20 * 3600_000);
export const stableAvatar = (url: string | null) => (url ? urlCache.resolve(url.split('?')[0]!, url) : null);
