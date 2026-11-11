// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

afterEach(() => { delete process.env.PAGES_HOST; });

const req = (host: string, path: string) => new NextRequest(`http://${host}${path}`, { headers: { host } });

describe('proxy', () => {
  it('reescreve /<slug> para /p/<slug> só no PAGES_HOST', async () => {
    process.env.PAGES_HOST = 'pages.local';
    const res = await proxy(req('pages.local', '/clinica-x7k2?captura=t'));
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://pages.local/p/clinica-x7k2?captura=t');
  });

  it('aceita PAGES_HOST com porta', async () => {
    process.env.PAGES_HOST = 'pages.local:3010';
    const res = await proxy(req('pages.local:3010', '/a-b'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/p/a-b');
  });

  it('no host de páginas, a raiz e caminhos fundos dão 404', async () => {
    process.env.PAGES_HOST = 'pages.local';
    expect((await proxy(req('pages.local', '/'))).status).toBe(404);
    expect((await proxy(req('pages.local', '/painel/leads'))).status).toBe(404);
  });

  it('no host de páginas, /api/open segue sem reescrita', async () => {
    process.env.PAGES_HOST = 'pages.local';
    const res = await proxy(req('pages.local', '/api/open'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('outros hosts não são reescritos', async () => {
    process.env.PAGES_HOST = 'pages.local';
    const res = await proxy(req('app.local', '/clinica-x7k2'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('sem PAGES_HOST nada é reescrito', async () => {
    const res = await proxy(req('pages.local', '/clinica-x7k2'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
