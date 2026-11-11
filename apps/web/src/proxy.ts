import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

function isPagesHost(request: NextRequest): boolean {
  const pagesHost = process.env.PAGES_HOST?.trim().toLowerCase();
  if (!pagesHost) return false;
  const host = (request.headers.get('host') ?? request.nextUrl.host).toLowerCase();
  return host === pagesHost || host.split(':')[0] === pagesHost;
}

// No host de páginas só existem /<slug> (reescrito para /p/<slug>) e o POST de abertura.
function pagesHostResponse(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname === '/api/open' || pathname.startsWith('/_next/')) return NextResponse.next();
  if (/^\/[^/]+\/?$/.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/p${pathname.replace(/\/$/, '')}`;
    return NextResponse.rewrite(url);
  }
  return new NextResponse('Não encontrado', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
}

export async function proxy(request: NextRequest) {
  if (isPagesHost(request)) return pagesHostResponse(request);
  if (!request.nextUrl.pathname.startsWith('/painel')) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL('/login?erro=config', request.url));

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
  if (!data.user) return NextResponse.redirect(new URL('/login', request.url));
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
