// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

const req = (host: string, path: string) => new NextRequest(`http://${host}${path}`, { headers: { host } });

describe('proxy', () => {
  it('deixa passar o que não é do painel', async () => {
    const res = await proxy(req('app.local', '/clinica-x7k2'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.status).toBe(200);
  });
});
