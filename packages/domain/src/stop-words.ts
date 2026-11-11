import { STOP_WORDS } from '@lps/config/messages';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = STOP_WORDS.map((w) => new RegExp(`(^|[^a-z0-9])${escape(normalize(w))}($|[^a-z0-9])`));

export function looksLikeStopRequest(text: string): boolean {
  const t = normalize(text);
  return PATTERNS.some((p) => p.test(t));
}
