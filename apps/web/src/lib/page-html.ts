const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export type InjectOptions = {
  videoUrl: string | null;
  /** Nulo na captura e na prévia do Gabriel: nada de script de abertura. */
  beaconSlug: string | null;
  /** Nonce da Content Security Policy, quando a resposta usa um. */
  nonce?: string;
};

const SLOT = /<(\w+)\b[^>]*\bdata-slot\s*=\s*["']video["'][^>]*>[\s\S]*?<\/\1>/i;

// Roda no navegador: a prévia do link no WhatsApp não executa JavaScript e não conta como abertura.
function beaconScript(slug: string, nonce?: string): string {
  const body = `fetch('/api/open',{method:'POST',body:JSON.stringify({slug:${JSON.stringify(slug).replace(/</g, '\\u003c')}}),keepalive:true})`;
  return `<script${nonce ? ` nonce="${esc(nonce)}"` : ''}>${body}</script>`;
}

export function injectPage(html: string, opts: InjectOptions): string {
  let out = html.replace(SLOT, (whole, tag: string) => {
    if (!opts.videoUrl) return '';
    const open = whole.slice(0, whole.indexOf('>') + 1);
    const video = `<video src="${esc(opts.videoUrl)}" controls playsinline preload="metadata" style="display:block;width:100%;max-width:48rem;margin:0 auto;border-radius:12px;background:#000"></video>`;
    return `${open}${video}</${tag}>`;
  });
  if (opts.beaconSlug) {
    const script = beaconScript(opts.beaconSlug, opts.nonce);
    const at = out.toLowerCase().lastIndexOf('</body>');
    out = at === -1 ? out + script : out.slice(0, at) + script + out.slice(at);
  }
  return out;
}

export function pageCsp(storageOrigin: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${storageOrigin} data: blob:`,
    `media-src ${storageOrigin} data: blob:`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    `script-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function expiredPageHtml(commercialName: string, whatsappUrl: string | null): string {
  const button = whatsappUrl
    ? `<a href="${esc(whatsappUrl)}" style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:8px;background:#16a34a;color:#fff;text-decoration:none;font-weight:600">Pedir de novo pelo WhatsApp</a>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(commercialName)}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,sans-serif;color:#404040;background:#fff"><main><p style="font-size:18px;margin:0">Este modelo não está mais disponível.</p>${button}</main></body></html>`;
}
