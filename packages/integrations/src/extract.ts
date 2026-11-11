import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_EXTRACTED_CHARS = 20_000;

export function truncateText(text: string): string {
  return text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function absolute(src: string, base?: string): string | null {
  try {
    const url = new URL(src.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Texto visível, título e imagens de um HTML. `baseUrl` resolve endereços relativos das imagens. */
export function extractHtmlText(html: string, baseUrl?: string): { title: string; text: string; images: string[] } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const images = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const url = absolute(match[1] ?? match[2] ?? match[3] ?? '', baseUrl);
    if (url) images.add(url);
  }
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|section|article|header|footer|tr|table)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return { title, text, images: [...images] };
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, ' ').trim();
}

export type InstagramExtractProfile = {
  biography?: string | null;
  externalUrl?: string | null;
  profilePicUrlHD?: string | null;
  profilePicUrl?: string | null;
  latestPosts?: { caption?: string | null; displayUrl?: string | null }[];
};

/** Bio, link externo e legendas dos 12 últimos posts, mais as imagens do perfil. */
export function instagramToExtract(profile: InstagramExtractProfile): { text: string; images: string[] } {
  const posts = (profile.latestPosts ?? []).slice(0, 12);
  const parts = [
    profile.biography ? `Bio: ${profile.biography}` : '',
    profile.externalUrl ? `Link na bio: ${profile.externalUrl}` : '',
    ...posts.map((p) => (p.caption ? `Post: ${p.caption}` : '')),
  ].filter(Boolean);
  const images = [profile.profilePicUrlHD ?? profile.profilePicUrl, ...posts.map((p) => p.displayUrl)].filter((u): u is string => !!u);
  return { text: parts.join('\n\n'), images: [...new Set(images)] };
}
