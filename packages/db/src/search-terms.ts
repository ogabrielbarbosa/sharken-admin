import { textSimilarity } from '@lps/domain';
import type { Db } from './client';

export type SearchTermKind = 'nicho' | 'local';
export type SearchTerm = { id: string; kind: SearchTermKind; label: string; variants: string[] };

/** A partir daqui o termo digitado é considerado o mesmo que um salvo ("lente dental" ≈ "lentes dentais"). */
export const TERM_MATCH_THRESHOLD = 0.45;

const countrySuffix = (country: string) => (country === 'BR' ? '' : ` @${country.toLowerCase()}`);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Termo salvo mais parecido com o que foi digitado (pelo rótulo ou por uma das variações). */
export async function findSearchTerm(db: Db, kind: SearchTermKind, typed: string, country = 'BR'): Promise<SearchTerm | null> {
  const { data, error } = await db.from('search_terms').select('id, kind, label, variants').eq('kind', kind);
  if (error) throw new Error(error.message);
  let best: { term: SearchTerm; score: number } | null = null;
  // Cada país tem as próprias variações: as de fora do Brasil levam o país no fim do rótulo.
  const suffix = countrySuffix(country);
  for (const row of data as SearchTerm[]) {
    const own = / @([a-z]{2})$/.exec(row.label)?.[0] ?? '';
    if (own !== suffix) continue;
    const term = { ...row, label: own ? row.label.slice(0, -own.length) : row.label };
    if (country !== 'BR' && kind === 'local') {
      // "springfield, illinois" e "springfield, ohio" são parecidas e são cidades diferentes.
      if (term.label === norm(typed).toLowerCase()) return term;
      continue;
    }
    const score = Math.max(...[term.label, ...term.variants].map((t) => textSimilarity(t, typed)));
    if (score >= TERM_MATCH_THRESHOLD && (!best || score > best.score)) best = { term, score };
  }
  return best?.term ?? null;
}

/** Guarda as variações aprovadas. O rótulo é o que foi digitado; salvar de novo troca as variações. */
export async function saveSearchTerm(db: Db, kind: SearchTermKind, label: string, variants: string[], country = 'BR') {
  const clean = [...new Map(variants.map(norm).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()];
  if (!norm(label) || !clean.length) return;
  const existing = await findSearchTerm(db, kind, label, country);
  const row = { kind, label: (existing?.label ?? norm(label).toLowerCase()) + countrySuffix(country), variants: clean, updated_at: new Date().toISOString() };
  const { error } = await db.from('search_terms').upsert(row, { onConflict: 'workspace_id,kind,label' });
  if (error) throw new Error(error.message);
}
