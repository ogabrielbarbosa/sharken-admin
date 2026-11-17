// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

import { signIn } from '@/app/login/actions';
import { safeNext } from '@/app/login/safe-next';

describe('signIn', () => {
  it('orienta a configurar quando faltam as chaves do Supabase', async () => {
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(signIn(new FormData())).rejects.toThrow('REDIRECT /login?erro=config');
    process.env = saved;
  });
});

describe('safeNext', () => {
  it('aceita só caminho interno', () => {
    expect(safeNext('/oauth/consent?authorization_id=x')).toBe('/oauth/consent?authorization_id=x');
    expect(safeNext('//evil.com')).toBe('/painel');
    expect(safeNext('/\\evil.com')).toBe('/painel');
    expect(safeNext('https://evil.com')).toBe('/painel');
    expect(safeNext(null)).toBe('/painel');
  });
});
