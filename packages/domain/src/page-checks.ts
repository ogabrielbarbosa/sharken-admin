import { findUnsupportedClaims } from './fact-check';

export type PageFacts = { name: string; phoneDigits: string; sourceText: string; allowedHosts: string[] };

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ');

function hostOf(url: string): string | null {
  const m = url.match(/^(?:https?:)?\/\/([^/?#:\s]+)/i);
  return m ? m[1]!.toLowerCase() : null;
}

function isOutside(url: string, isLink: boolean, allowed: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false; // relative, #, data:, mailto:, tel:
  if (allowed.includes(host)) return false;
  return !(isLink && host === 'wa.me');
}

function references(html: string): { url: string; isLink: boolean }[] {
  const found: { url: string; isLink: boolean }[] = [];
  for (const tag of html.matchAll(/<(\w+)\b[^>]*>/g)) {
    const isAnchor = tag[1]!.toLowerCase() === 'a';
    for (const attr of tag[0].matchAll(/\s(src|href|poster|data|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const url = (attr[2] ?? attr[3] ?? attr[4] ?? '').trim();
      if (url) found.push({ url, isLink: isAnchor && attr[1]!.toLowerCase() === 'href' });
    }
    for (const attr of tag[0].matchAll(/\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const part of (attr[1] ?? attr[2] ?? '').split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) found.push({ url, isLink: false });
      }
    }
  }
  for (const m of html.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (url) found.push({ url, isLink: false });
  }
  for (const m of html.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    const url = m[1] ?? m[2];
    if (url) found.push({ url, isLink: false });
  }
  return found;
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export function checkPageHtml(html: string, facts: PageFacts): string[] {
  const problems: string[] = [];
  if (!/data-slot\s*=\s*["']video["']/i.test(html)) problems.push('Falta o espaço do vídeo (data-slot="video").');
  if (/<script\b/i.test(html)) problems.push('A página tem <script>.');

  const allowed = [...FONT_HOSTS, ...facts.allowedHosts.map((h) => h.toLowerCase())];
  const outside = new Set<string>();
  for (const ref of references(html)) if (isOutside(ref.url, ref.isLink, allowed)) outside.add(ref.url);
  for (const url of outside) problems.push(`Carrega recurso de fora: ${url}`);

  const text = visibleText(html);
  if (!plain(text).includes(plain(facts.name))) problems.push('Falta o nome do negócio.');

  const digits = text.replace(/\D/g, '');
  const phone = facts.phoneDigits.replace(/\D/g, '');
  const bare = phone.startsWith('55') && phone.length > 11 ? phone.slice(2) : phone;
  if (!phone || !(digits.includes(bare) || digits.includes(`55${bare}`))) problems.push('Falta o telefone.');

  problems.push(
    ...findUnsupportedClaims({ headline: text, subheadline: '', about: null, services: [], cta: '' }, facts.sourceText),
  );
  return problems;
}
