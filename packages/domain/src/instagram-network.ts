import { instagramHandle } from './lead-keys';

/** Listas de um perfil do Instagram que podem virar leads. */
export type ProfileRelation = 'following' | 'followers';
export type NetworkRun = { relation: ProfileRelation; run_id: string; dataset_id: string | null };

export const RELATION_LABEL: Record<ProfileRelation, string> = { following: 'Seguindo', followers: 'Seguidores' };
export const relationsLabel = (relations: ProfileRelation[]) => relations.map((r) => RELATION_LABEL[r]).join(' e ');

/** Teto de perfis num batch: cada um é lido e analisado (custa Apify e Claude). */
export const MAX_NETWORK_PROFILES = 500;
/** Nome do batch quando o nicho fica vazio. */
export const PROFILE_BATCH_NICHE = 'Perfis do Instagram';

/** @ a partir do link ou do nome digitado ("@sharken", "instagram.com/sharken/?hl=pt"). Null se não for perfil. */
export function profileHandle(input: string): string | null {
  const text = input.trim();
  if (/instagram\.com/i.test(text)) return instagramHandle(text);
  return /^@?[a-z0-9._]{1,30}$/i.test(text) ? instagramHandle(`https://www.instagram.com/${text.replace(/^@/, '')}`) : null;
}

/** @ das listas, sem repetir e sem o próprio perfil. Linhas sem nome (erros do ator) ficam de fora. */
export function handlesFromNetwork(rows: { username?: string | null }[], source: string): string[] {
  const all = rows.flatMap((r) => (r.username ? [r.username.toLowerCase()] : []));
  return [...new Set(all)].filter((h) => h !== source.toLowerCase());
}
