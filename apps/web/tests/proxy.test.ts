// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ssr = vi.hoisted(() => ({ user: null as { id: string } | null, rotate: true, created: 0 }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (l: { name: string; value: string; options: object }[]) => void } }) => {
    ssr.created++;
    return {
      auth: {
        getUser: async () => {
          // Simula o Supabase renovando o token: grava o refresh token novo.
          if (ssr.rotate) opts.cookies.setAll([{ name: 'sb-token', value: 'novo', options: { path: '/' } }]);
          return { data: { user: ssr.user } };
        },
      },
    };
  },
}));

import { proxy } from '@/proxy';

const req = (host: string, path: string) => new NextRequest(`http://${host}${path}`, { headers: { host } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supa.local';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  ssr.user = null;
  ssr.rotate = true;
  ssr.created = 0;
});

describe('proxy', () => {
  it('deixa passar o que não é do painel', async () => {
    const res = await proxy(req('app.local', '/clinica-x7k2'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
    expect(ssr.created).toBe(0);
  });

  it('não mexe na sessão em /api nem em /.well-known', async () => {
    await proxy(req('app.local', '/api/mcp'));
    await proxy(req('app.local', '/.well-known/oauth-protected-resource'));
    expect(ssr.created).toBe(0);
  });

  it('painel sem usuário vai para o login', async () => {
    const res = await proxy(req('app.local', '/painel'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://app.local/login');
  });

  it('painel com usuário grava os cookies renovados', async () => {
    ssr.user = { id: 'u' };
    const res = await proxy(req('app.local', '/painel/batches'));
    expect(res.status).toBe(200);
    expect(res.cookies.get('sb-token')?.value).toBe('novo');
  });

  it('consentimento renova a sessão e grava os cookies, sem redirecionar', async () => {
    ssr.user = { id: 'u' };
    const res = await proxy(req('app.local', '/oauth/consent?authorization_id=abc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.cookies.get('sb-token')?.value).toBe('novo');
  });

  it('consentimento sem usuário deixa a página decidir (ela leva o next)', async () => {
    const res = await proxy(req('app.local', '/oauth/consent?authorization_id=abc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('no host das páginas reescreve /<id> e não toca na sessão', async () => {
    const res = await proxy(req('pages.sharkenapps.com', '/abcDEF2345'));
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://pages.sharkenapps.com/paginas-publicadas/abcDEF2345');
    expect(ssr.created).toBe(0);
  });

  it('no host das páginas o resto é 404, painel incluído', async () => {
    for (const path of ['/', '/painel/batches', '/api/mcp', '/login', '/a/b', '/oauth/consent']) {
      expect((await proxy(req('pages.sharkenapps.com', path))).status).toBe(404);
    }
  });

  it('no domínio do painel o caminho interno das páginas não existe', async () => {
    expect((await proxy(req('app.local', '/paginas-publicadas/abcDEF2345'))).status).toBe(404);
  });
});
