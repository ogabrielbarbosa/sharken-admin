// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fetchTemplateHtml } from '@/lib/template-fetch';

const url = new URL('http://x.test/p/a/template');
const stub = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;

describe('fetchTemplateHtml', () => {
  it('devolve o HTML em 200', async () => {
    expect(await fetchTemplateHtml(url, '', stub(new Response('<p>ok</p>')))).toEqual({ kind: 'html', body: '<p>ok</p>', status: 200 });
  });
  it('404 vira missing', async () => {
    expect((await fetchTemplateHtml(url, '', stub(new Response('x', { status: 404 })))).kind).toBe('missing');
  });
  it.each([401, 500, 503])('status %i vira error', async (status) => {
    expect((await fetchTemplateHtml(url, '', stub(new Response('<h1>protegido</h1>', { status })))).kind).toBe('error');
  });
  it('exceção de rede vira error', async () => {
    expect((await fetchTemplateHtml(url, '', stub(new Error('boom')))).kind).toBe('error');
  });
  it('redirecionamento 307 vira error e não é seguido', async () => {
    let init: RequestInit | undefined;
    const spy = (async (_u: unknown, i?: RequestInit) => { init = i; return new Response(null, { status: 307, headers: { location: 'https://vercel.com/sso' } }); }) as unknown as typeof fetch;
    expect((await fetchTemplateHtml(url, '', spy)).kind).toBe('error');
    expect(init?.redirect).toBe('manual');
  });
  it('tempo esgotado vira error e o sinal de timeout é passado', async () => {
    let signal: AbortSignal | null | undefined;
    const spy = (async (_u: unknown, i?: RequestInit) => { signal = i?.signal; throw new DOMException('timeout', 'AbortError'); }) as unknown as typeof fetch;
    expect((await fetchTemplateHtml(url, '', spy, 10)).kind).toBe('error');
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
