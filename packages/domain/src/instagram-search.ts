import { instagramHandle } from './lead-keys';

/** Tira posts, reels e páginas do Instagram: a busca traz só perfis. */
export const INSTAGRAM_SEARCH_EXCLUDES = ['-inurl:/p/', '-inurl:/reel/', '-inurl:/reels/', '-inurl:/explore/', '-inurl:/tv/', '-inurl:/stories/'];
/** O Google ignora o que passa de 32 palavras numa consulta. */
export const GOOGLE_WORD_LIMIT = 32;

const clean = (term: string) => term.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
const words = (term: string) => term.split(' ').length;
const group = (terms: string[]) => (terms.length === 1 ? `"${terms[0]}"` : `(${terms.map((t) => `"${t}"`).join(' OR ')})`);

/** Divide os termos em grupos que cabem em `budget` palavras (cada OR conta uma). */
function chunk(terms: string[], budget: number): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let used = 0;
  for (const term of terms) {
    const cost = words(term) + (current.length ? 1 : 0);
    if (current.length && used + cost > budget) {
      out.push(current);
      current = [];
      used = 0;
    }
    used += words(term) + (current.length ? 1 : 0);
    current.push(term);
  }
  if (current.length) out.push(current);
  return out;
}

const unique = (terms: string[]) => [...new Map(terms.map(clean).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];

/**
 * Busca avançada no Google que traz perfis do Instagram de um nicho numa região, como o Gabriel faz à mão:
 * site:instagram.com ("lentes dentais" OR "facetas") ("são josé dos campos" OR "sjc") -inurl:/p/ ...
 * Quando os termos não cabem numa consulta, divide em várias (cada grupo de nichos com cada grupo de lugares).
 */
export function buildInstagramQueries(niches: string[], locations: string[]): string[] {
  const n = unique(niches);
  const l = unique(locations);
  if (!n.length) return [];
  const fixed = 1 + INSTAGRAM_SEARCH_EXCLUDES.length;
  const free = GOOGLE_WORD_LIMIT - fixed;
  const locGroups = l.length ? chunk(l, Math.floor(free / 2)) : [[]];
  return locGroups.flatMap((locs) => {
    const locWords = locs.length ? locs.reduce((s, t) => s + words(t), 0) + locs.length - 1 : 0;
    return chunk(n, Math.max(free - locWords, 1)).map((nich) =>
      ['site:instagram.com', group(nich), ...(locs.length ? [group(locs)] : []), ...INSTAGRAM_SEARCH_EXCLUDES].join(' '));
  });
}

/** Páginas por consulta para chegar perto da quantidade pedida (10 resultados por página, até 10 páginas). */
export function searchPagesFor(quantity: number, queries: number): number {
  return Math.min(10, Math.max(1, Math.ceil(quantity / 10 / Math.max(queries, 1))));
}

export type GoogleSearchPage = { organicResults?: { url?: string }[] };

/** Usuários do Instagram nos resultados, na ordem em que aparecem, sem repetir. */
export function handlesFromSearch(pages: GoogleSearchPage[]): string[] {
  const out = new Set<string>();
  for (const page of pages) for (const r of page.organicResults ?? []) {
    const h = instagramHandle(r.url);
    if (h) out.add(h);
  }
  return [...out];
}
