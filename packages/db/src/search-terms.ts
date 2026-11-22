import { textSimilarity } from '@lps/domain';
import type { Db } from './client';

export type SearchTermKind = 'nicho' | 'local';
export type SearchTerm = { id: string; kind: SearchTermKind; label: string; variants: string[] };

/** A partir daqui o termo digitado é considerado o mesmo que um salvo ("lente dental" ≈ "lentes dentais"). */
export const TERM_MATCH_THRESHOLD = 0.45;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Termo salvo mais parecido com o que foi digitado (pelo rótulo ou por uma das variações). */
export async function findSearchTerm(db: Db, kind: SearchTermKind, typed: string): Promise<SearchTerm | null> {
  const { data, error } = await db.from('search_terms').select('id, kind, label, variants').eq('kind', kind);
  if (error) throw new Error(error.message);
  let best: { term: SearchTerm; score: number } | null = null;
  for (const term of data as SearchTerm[]) {
    const score = Math.max(...[term.label, ...term.variants].map((t) => textSimilarity(t, typed)));
    if (score >= TERM_MATCH_THRESHOLD && (!best || score > best.score)) best = { term, score };
  }
  return best?.term ?? null;
}

/** Guarda as variações aprovadas. O rótulo é o que foi digitado; salvar de novo troca as variações. */
export async function saveSearchTerm(db: Db, kind: SearchTermKind, label: string, variants: string[]) {
  const clean = [...new Map(variants.map(norm).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()];
  if (!norm(label) || !clean.length) return;
  const existing = await findSearchTerm(db, kind, label);
  const row = { kind, label: existing?.label ?? norm(label).toLowerCase(), variants: clean, updated_at: new Date().toISOString() };
  const { error } = await db.from('search_terms').upsert(row, { onConflict: 'workspace_id,kind,label' });
  if (error) throw new Error(error.message);
}
