// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

const admin = vi.hoisted(() => ({
  auth: { admin: { createUser: async ({ email }: { email: string }) => ({ data: { user: { id: 'novo', email } }, error: null }) } },
}));
const invites = vi.hoisted(() => ({ pending: [{ id: 'i' }] as unknown[] }));
vi.mock('@lps/db', async (orig) => ({
  ...(await orig<typeof import('@lps/db')>()),
  createAdminClient: () => admin,
  findUserByEmail: async () => null,
  pendingInvites: async () => invites.pending,
  acceptInvites: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { signInWithPassword: async () => ({ data: { user: { id: 'novo' } }, error: null }) } }),
}));

import { signIn, signUp } from '@/app/login/actions';
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

describe('signUp', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const base = { email: 'primo@exemplo.com', password: '12345678', confirm: '12345678' };

  it('volta para o next depois de criar a conta (ex.: consentimento OAuth)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supa.local';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    invites.pending = [{ id: 'i' }];
    await expect(signUp(form({ ...base, next: '/oauth/consent?authorization_id=abc' }))).rejects.toThrow('REDIRECT /oauth/consent?authorization_id=abc');
    await expect(signUp(form({ ...base, next: 'https://evil.com' }))).rejects.toThrow('REDIRECT /painel');
    await expect(signUp(form(base))).rejects.toThrow('REDIRECT /painel');
  });

  it('erro mantém o next na volta para o cadastro', async () => {
    invites.pending = [];
    await expect(signUp(form({ ...base, next: '/oauth/consent?authorization_id=abc' }))).rejects.toThrow(
      `REDIRECT /cadastro?${new URLSearchParams({ erro: 'sem-convite', email: base.email, next: '/oauth/consent?authorization_id=abc' })}`,
    );
  });
});

describe('safeNext', () => {
  it('aceita só caminho interno', () => {
    expect(safeNext('/oauth/consent?authorization_id=x')).toBe('/oauth/consent?authorization_id=x');
    expect(safeNext('//evil.com')).toBe('/painel');
    expect(safeNext('/\\evil.com')).toBe('/painel');
    expect(safeNext('https://evil.com')).toBe('/painel');
    expect(safeNext(null)).toBe('/painel');
    expect(safeNext('/\t/evil.com')).toBe('/painel');
    expect(safeNext('/\n/evil.com')).toBe('/painel');
    expect(safeNext('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com'); // fica no mesmo site, sem virar externo
  });
});
