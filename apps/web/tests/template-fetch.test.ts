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
});
