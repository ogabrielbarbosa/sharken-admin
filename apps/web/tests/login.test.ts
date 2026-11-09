// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

import { signIn } from '@/app/login/actions';

describe('signIn', () => {
  it('orienta a configurar quando faltam as chaves do Supabase', async () => {
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(signIn(new FormData())).rejects.toThrow('REDIRECT /login?erro=config');
    process.env = saved;
  });
});
