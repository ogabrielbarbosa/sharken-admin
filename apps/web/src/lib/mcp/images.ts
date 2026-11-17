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

const REENCODE_ABOVE_BYTES = 300_000;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_SIDE = 1600;
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;
const PASSTHROUGH_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** Soma máxima de caracteres base64 por resposta (o limite da Vercel é ~4,5 MB). */
export const MAX_TOTAL_BASE64_CHARS = 3_500_000;

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

function describe(s: ImageSource, failed: boolean, overBudget = false): string {
  const lines = [`${ORIGIN_LABEL[s.origin]}`];
  if (s.post_url) lines.push(`Post: ${s.post_url}`);
  if (!s.temporary) lines.push(`Link: ${s.url}`);
  if (s.caption) lines.push(`Legenda: <conteudo_externo>${s.caption.replace(/<\/?conteudo_externo>/gi, '')}</conteudo_externo>`);
  if (s.temporary) lines.push('Aviso: link temporário, não usar na página.');
  if (failed) lines.push('Falha: não consegui baixar esta imagem.');
  if (overBudget) lines.push(...(s.temporary ? [`Link: ${s.url}`] : []), 'Imagem: não coube nesta resposta; peça com `limite` menor ou `origem` específica.');
  return lines.join('\n');
}

async function readCapped(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error('imagem grande demais');
  if (!res.body) throw new Error('sem corpo');
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('imagem grande demais');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function download(url: string, fetcher: typeof fetch): Promise<{ data: string; mimeType: string }> {
  if (new URL(url).protocol !== 'https:') throw new Error('só https');
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mimeType.startsWith('image/')) throw new Error('não é imagem');
  const buf = await readCapped(res);
  if (PASSTHROUGH_MIMES.has(mimeType) && buf.length <= REENCODE_ABOVE_BYTES) return { data: buf.toString('base64'), mimeType };
  const out = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { data: out.toString('base64'), mimeType: 'image/jpeg' };
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

  let used = 0;
  return sources.flatMap((s, i): McpContent[] => {
    const r = results[i];
    if (!r) return [{ type: 'text', text: describe(s, true) }];
    if (used + r.data.length > MAX_TOTAL_BASE64_CHARS) return [{ type: 'text', text: describe(s, false, true) }];
    used += r.data.length;
    return [{ type: 'text', text: describe(s, false) }, { type: 'image', data: r.data, mimeType: r.mimeType }];
  });
}
