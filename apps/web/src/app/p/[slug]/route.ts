import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@lps/db';
import { expiredPageHtml, injectPage, pageCsp } from '@/lib/page-html';
import { lookupPage } from '@/lib/page-access';
import { fetchTemplateHtml } from '@/lib/template-fetch';

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
  try {
    return await servePage(request, params);
  } catch (error) {
    console.error('página: erro ao servir', error instanceof Error ? error.message : error);
    return expired(200);
  }
}

async function servePage(request: Request, params: Promise<{ slug: string }>): Promise<Response> {
  const { slug } = await params;
  const captura = new URL(request.url).searchParams.get('captura');
  const found = await lookupPage(slug, captura);
  if (found.kind === 'missing') return expired(404);
  if (found.kind === 'unavailable') return expired(200);
  const { site, capture, preview } = found;

  // Páginas do template continuam sendo desenhadas pelo React, na rota /p/<slug>/template.
  // Renderizar o componente aqui dentro não é simples (react-dom/server e o CSS do Tailwind), por isso a busca HTTP fica, com tempo limite.
  if (site.generator === 'template' || !site.html_path) {
    const base = process.env.APP_URL;
    if (!base) return expired(200);
    const inner = new URL(`/p/${encodeURIComponent(slug)}/template`, base);
    if (captura) inner.searchParams.set('captura', captura);
    const result = await fetchTemplateHtml(inner, request.headers.get('cookie') ?? '');
    if (result.kind === 'html') return new Response(result.body, { status: result.status, headers: BASE_HEADERS });
    if (result.kind === 'missing') return expired(404);
    console.error('página: falha ao buscar o template', slug);
    return expired(200);
  }

  const db = createAdminClient();
  const file = await db.storage.from('pages').download(site.html_path);
  if (file.error || !file.data) {
    console.error('página: html não encontrado no Storage', slug);
    return expired(200);
  }
  const html = await file.data.text();

  let videoUrl: string | null = null;
  if (!capture) {
    const { data: video, error } = await db.from('videos').select('status, storage_path').eq('lead_id', site.lead_id).maybeSingle();
    if (error) console.error('página: erro ao buscar o vídeo', error.message);
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
