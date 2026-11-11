import { normalizeLinkUrl } from './completar';

/** Link da página: aceita sem esquema, exige https (http vira https). */
export function parsePageUrl(raw: string): string | null {
  const normalized = normalizeLinkUrl(raw);
  if (!normalized) return null;
  const url = new URL(normalized);
  url.protocol = 'https:';
  return url.toString();
}

/** Link do Loom: devolve https://www.loom.com/share/<id>, sem query, ou null. */
export function parseLoomUrl(raw: string): string | null {
  const normalized = normalizeLinkUrl(raw);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.hostname !== 'loom.com' && url.hostname !== 'www.loom.com') return null;
  const match = url.pathname.match(/^\/share\/([A-Za-z0-9]+)\/?$/);
  return match ? `https://www.loom.com/share/${match[1]}` : null;
}
