/** Imagem do Instagram do lead já salva no R2. */
export type InstagramMedia = {
  kind: 'perfil' | 'post';
  url: string;
  post_url: string | null;
  caption: string | null;
  taken_at: string | null;
};

type ApifyPost = {
  type?: string | null;
  url?: string | null;
  caption?: string | null;
  timestamp?: string | null;
  displayUrl?: string | null;
  images?: (string | null)[] | null;
  childPosts?: { displayUrl?: string | null }[] | null;
};

export type InstagramMediaProfile = {
  profilePicUrlHD?: string | null;
  profilePicUrl?: string | null;
  latestPosts?: ApifyPost[] | null;
};

/** Imagem a baixar: a origem (link do Instagram, expira) e o que vai junto para o lead. */
export type InstagramMediaSource = Omit<InstagramMedia, 'url'> & { source: string };

export const INSTAGRAM_POSTS_LIMIT = 12;

/**
 * Foto de perfil em HD e as imagens dos últimos 12 posts: todas as do carrossel e só a capa do vídeo.
 * Sem repetir a mesma imagem.
 */
export function pickInstagramMedia(profile: InstagramMediaProfile): InstagramMediaSource[] {
  const out: InstagramMediaSource[] = [];
  const seen = new Set<string>();
  const add = (source: string | null | undefined, item: Omit<InstagramMediaSource, 'source'>) => {
    if (!source || !/^https?:\/\//i.test(source) || seen.has(source)) return;
    seen.add(source);
    out.push({ ...item, source });
  };

  add(profile.profilePicUrlHD ?? profile.profilePicUrl, { kind: 'perfil', post_url: null, caption: null, taken_at: null });
  for (const post of (profile.latestPosts ?? []).slice(0, INSTAGRAM_POSTS_LIMIT)) {
    const meta = { kind: 'post' as const, post_url: post.url ?? null, caption: post.caption?.trim() || null, taken_at: post.timestamp ?? null };
    const carousel = [...(post.images ?? []), ...(post.childPosts ?? []).map((c) => c.displayUrl)].filter((u): u is string => !!u);
    const sources = post.type === 'Sidecar' && carousel.length ? carousel : [post.displayUrl];
    for (const s of sources) add(s, meta);
  }
  return out;
}

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' };

/** Caminho no R2: um diretório por lead, a foto de perfil e os posts numerados na ordem. */
export function instagramMediaKey(leadId: string, item: Pick<InstagramMedia, 'kind'>, index: number, mime: string | null): string {
  const ext = EXT_BY_MIME[(mime ?? '').split(';')[0]!.trim().toLowerCase()] ?? 'jpg';
  const name = item.kind === 'perfil' ? 'perfil' : `post-${String(index).padStart(2, '0')}`;
  return `leads/${leadId}/instagram/${name}.${ext}`;
}
