import { createAdminClient, getPublicPage } from '@lps/db';
import { pagesHost } from '@/lib/pages-host';

export const dynamic = 'force-dynamic';

/**
 * O HTML vem do agente: roda em sandbox (origem opaca, sem acesso a cookies nem armazenamento de nenhum
 * domínio nosso), mas com scripts, formulários e links para fora (WhatsApp, Instagram) funcionando.
 */
const SANDBOX = 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals allow-downloads';

const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': SANDBOX,
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  // Expiração e republicação valem na hora.
  'cache-control': 'no-store',
  ...extra,
});

const message = (title: string, text: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fafafa;color:#333}
main{text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#666}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Só no host das páginas (o proxy reescreve /<id> para cá); no domínio do painel não existe.
  if (req.headers.get('host') !== pagesHost()) return new Response('Not found', { status: 404 });
  const { id } = await params;
  const page = await getPublicPage(createAdminClient(), id);
  if (!page) return new Response(message('Página não encontrada', 'Confira o link.'), { status: 404, headers: headers() });
  if (page.expired) return new Response(message('Esta página expirou', 'Peça um link novo a quem enviou.'), { status: 410, headers: headers() });
  return new Response(page.html, { status: 200, headers: headers() });
}
