import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@lps/db';
import { expiredPageHtml, injectPage, pageCsp } from '@/lib/page-html';
import { lookupPage } from '@/lib/page-access';

export const dynamic = 'force-dynamic';

const BASE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
};

function expired(status: number): Response {
  const digits = (process.env.PROSPECT_WHATSAPP ?? '').replace(/\D/g, '');
  const body = expiredPageHtml(process.env.COMMERCIAL_NAME || 'Sharken', digits ? `https://wa.me/${digits}` : null);
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const captura = new URL(request.url).searchParams.get('captura');
  const found = await lookupPage(slug, captura);
  if (found.kind === 'missing') return expired(404);
  if (found.kind === 'unavailable') return expired(200);
  const { site, capture, preview } = found;

  // Páginas do template continuam sendo desenhadas pelo React, na rota /p/<slug>/template.
  if (site.generator === 'template' || !site.html_path) {
    const inner = new URL(`/p/${encodeURIComponent(slug)}/template`, process.env.APP_URL ?? request.url);
    if (captura) inner.searchParams.set('captura', captura);
    const res = await fetch(inner, { headers: { cookie: request.headers.get('cookie') ?? '' }, cache: 'no-store' });
    if (res.status === 404) return expired(200);
    return new Response(await res.text(), { status: res.status, headers: BASE_HEADERS });
  }

  const db = createAdminClient();
  const file = await db.storage.from('pages').download(site.html_path);
  if (file.error || !file.data) return expired(200);
  const html = await file.data.text();

  let videoUrl: string | null = null;
  if (!capture) {
    const { data: video } = await db.from('videos').select('status, storage_path').eq('lead_id', site.lead_id).maybeSingle();
    if (video?.status === 'pronto' && video.storage_path) {
      videoUrl = db.storage.from('media').getPublicUrl(video.storage_path as string).data.publicUrl;
    }
  }

  const nonce = randomBytes(16).toString('base64');
  const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  return new Response(injectPage(html, { videoUrl, beaconSlug: preview ? null : slug, nonce }), {
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': pageCsp(storageOrigin, nonce) },
  });
}
