import sharp from 'sharp';
import type { Lead, LeadAsset } from '@lps/domain';

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export type ImageSource = {
  url: string;
  origin: 'instagram_perfil' | 'instagram_post' | 'foto' | 'material';
  caption?: string | null;
  post_url?: string | null;
  temporary: boolean;
};

const MAX_BYTES = 1_000_000;
const MAX_SIDE = 1600;
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;

/** Imagens do lead na ordem: perfil do Instagram, posts, fotos do Maps, material. Sem repetir URL. */
export function leadImageSources(
  lead: Lead,
  assets: LeadAsset[],
  signed: Map<string, string>,
  origem: 'instagram' | 'fotos' | 'material' | 'todas',
  limit: number,
): ImageSource[] {
  const max = Math.min(20, Math.max(1, Math.floor(limit) || 1));
  const all = origem === 'todas';
  const out: ImageSource[] = [];

  if (all || origem === 'instagram') {
    const media = lead.instagram_media ?? [];
    for (const m of [...media.filter((i) => i.kind === 'perfil'), ...media.filter((i) => i.kind === 'post')]) {
      out.push({ url: m.url, origin: m.kind === 'perfil' ? 'instagram_perfil' : 'instagram_post', caption: m.caption, post_url: m.post_url, temporary: false });
    }
  }
  if (all || origem === 'fotos') {
    for (const url of lead.photos ?? []) out.push({ url, origin: 'foto', temporary: false });
  }
  if (all || origem === 'material') {
    for (const a of assets) {
      if (a.status !== 'pronto') continue;
      for (const path of a.extracted_images ?? []) {
        const url = signed.get(path);
        if (url) out.push({ url, origin: 'material', temporary: true });
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, max);
}

const ORIGIN_LABEL: Record<ImageSource['origin'], string> = {
  instagram_perfil: 'Foto de perfil do Instagram',
  instagram_post: 'Post do Instagram',
  foto: 'Foto do Google Maps',
  material: 'Material enviado',
};

function describe(s: ImageSource, failed: boolean): string {
  const lines = [`${ORIGIN_LABEL[s.origin]}`];
  if (s.post_url) lines.push(`Post: ${s.post_url}`);
  if (!s.temporary) lines.push(`Link: ${s.url}`);
  if (s.caption) lines.push(`Legenda: <conteudo_externo>${s.caption}</conteudo_externo>`);
  if (s.temporary) lines.push('Aviso: link temporário, não usar na página.');
  if (failed) lines.push('Falha: não consegui baixar esta imagem.');
  return lines.join('\n');
}

async function download(url: string, fetcher: typeof fetch): Promise<{ data: string; mimeType: string }> {
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mimeType.startsWith('image/')) throw new Error('não é imagem');
  let buf: Buffer = Buffer.from(await res.arrayBuffer());
  let mime = mimeType;
  if (buf.length > MAX_BYTES) {
    buf = await sharp(buf).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    mime = 'image/jpeg';
  }
  return { data: buf.toString('base64'), mimeType: mime };
}

export async function imageBlocks(sources: ImageSource[], fetcher: typeof fetch = fetch): Promise<McpContent[]> {
  if (!sources.length) return [{ type: 'text', text: 'Este lead não tem imagens.' }];

  const results: ({ data: string; mimeType: string } | null)[] = new Array(sources.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const i = next++;
      try { results[i] = await download(sources[i]!.url, fetcher); } catch { results[i] = null; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, worker));

  return sources.flatMap((s, i): McpContent[] => {
    const r = results[i];
    const text: McpContent = { type: 'text', text: describe(s, !r) };
    return r ? [text, { type: 'image', data: r.data, mimeType: r.mimeType }] : [text];
  });
}
