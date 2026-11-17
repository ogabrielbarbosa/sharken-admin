import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { PAGES_ROUTE, pagesHost } from '@/lib/pages-host';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');

  // No host das páginas só existe /<id>; nada do painel, da API ou do login responde ali.
  if (host === pagesHost()) {
    const id = /^\/([A-Za-z0-9]{6,32})\/?$/.exec(pathname)?.[1];
    if (!id) return new NextResponse('Página não encontrada.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return NextResponse.rewrite(new URL(`${PAGES_ROUTE}/${id}`, request.url));
  }
  // Fora dele, o caminho interno não existe: o HTML publicado nunca roda no domínio do painel.
  if (pathname.startsWith(PAGES_ROUTE)) return new NextResponse('Not found', { status: 404 });

  const painel = pathname.startsWith('/painel');
  // O consentimento OAuth também precisa da sessão renovada com os cookies gravados na resposta:
  // a página (Server Component) não grava cookies e a ação seguinte usaria o refresh token antigo.
  const oauth = pathname.startsWith('/oauth/');
  if (!painel && !oauth) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return painel ? NextResponse.redirect(new URL('/login?erro=config', request.url)) : response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  // No consentimento quem leva para o login é a própria página, com o `next` de volta.
  if (!data.user && painel) return NextResponse.redirect(new URL('/login', request.url));
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
