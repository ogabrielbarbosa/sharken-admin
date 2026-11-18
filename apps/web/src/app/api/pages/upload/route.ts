import { createAdminClient, LEAD_NOT_FOUND, MAX_PAGE_HTML, PAGE_NOT_FOUND, publishPage, scopeDb } from '@lps/db';
import { verifyUpload } from '@/lib/page-upload';

export const maxDuration = 60;

const json = (status: number, body: unknown) => Response.json(body, { status });

/**
 * Recebe o arquivo HTML da página pelo link que `preparar_upload_da_pagina` devolveu:
 * `curl -X PUT --data-binary @pagina.html "<link>"`. Publica, grava o link no lead e responde o endereço.
 */
async function upload(req: Request): Promise<Response> {
  const grant = verifyUpload(new URL(req.url).searchParams.get('token'));
  if (!grant) return json(401, { erro: 'Link de upload inválido ou vencido. Peça outro com preparar_upload_da_pagina.' });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_PAGE_HTML * 4) return json(413, { erro: 'Arquivo grande demais.' });

  const html = await req.text();
  if (!html.trim()) return json(400, { erro: 'O arquivo chegou vazio. Use --data-binary @arquivo.html.' });

  const db = scopeDb(createAdminClient(), grant.w);
  // Página nova: o primeiro envio cria com o id reservado; os seguintes (mesmo link) só trocam o HTML.
  let existing = !grant.n;
  if (grant.n) {
    const { data, error } = await db.from('pages').select('id').eq('id', grant.p).maybeSingle();
    if (error) throw new Error(error.message);
    existing = !!data;
  }
  try {
    const { page, url } = await publishPage(db, {
      leadId: grant.l,
      html,
      title: grant.t ?? undefined,
      expiresInHours: existing && grant.n ? undefined : grant.e,
      ...(existing ? { pageId: grant.p } : { newId: grant.p }),
      userId: grant.u,
    });
    return json(200, { url, pagina_id: page.id, expires_at: page.expires_at, caracteres: html.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message === LEAD_NOT_FOUND || message === PAGE_NOT_FOUND) return json(404, { erro: message });
    if (message.startsWith('O HTML')) return json(400, { erro: message });
    console.error('Erro no upload de página:', e);
    return json(500, { erro: 'Erro ao publicar a página.' });
  }
}

export { upload as PUT, upload as POST };
