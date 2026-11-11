import type { Lead } from './types';

export type AssetKind = 'link' | 'arquivo' | 'texto';
export type AssetStatus = 'extraindo' | 'pronto' | 'erro';

export type LeadAsset = {
  id: string;
  created_at: string;
  lead_id: string;
  kind: AssetKind;
  label: string | null;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  body: string | null;
  extracted_text: string | null;
  extracted_images: string[];
  status: AssetStatus;
  error: string | null;
};

export const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export function isAcceptedMime(mime: string): boolean {
  return mime.startsWith('image/') || DOC_MIMES.includes(mime);
}

export function canGenerateMaterial(
  lead: Pick<Lead, 'flow' | 'reason'>,
  _assets: { status: AssetStatus }[],
): { ok: true } | { ok: false; reason: string } {
  if (lead.flow === 'melhorar_site' && !lead.reason?.trim()) return { ok: false, reason: 'Preencha o motivo para gerar o material.' };
  return { ok: true };
}

/** Nome seguro para o caminho no Storage: sem acentos, espaços ou barras. */
export function sanitizeFileName(name: string): string {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
  return clean.slice(-80) || 'arquivo';
}

/** Aceita "instagram.com/x" sem esquema. Devolve null se não for uma URL http(s). */
export function normalizeLinkUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Próximo da fila, depois do atual e dando a volta, que ainda está pendente. */
export function nextPending(order: string[], currentId: string, pending: Set<string>): string | null {
  const list = order.includes(currentId) ? order : [...order, currentId];
  const start = list.indexOf(currentId);
  for (let i = 1; i < list.length; i++) {
    const id = list[(start + i) % list.length];
    if (pending.has(id)) return id;
  }
  return null;
}
