// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

const auth = {
  getUser: vi.fn(),
  oauth: { getAuthorizationDetails: vi.fn(), approveAuthorization: vi.fn(), denyAuthorization: vi.fn() },
};
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth }) }));

import { approve, deny } from '@/app/oauth/consent/actions';
import ConsentPage from '@/app/oauth/consent/page';

const render = (id?: string) => ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) });

beforeEach(() => vi.clearAllMocks());

describe('consentimento OAuth', () => {
  it('sem usuário manda para o login com retorno', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(render('abc')).rejects.toThrow('REDIRECT /login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc');
  });

  it('já autorizado redireciona direto', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    auth.oauth.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=1' }, error: null });
    await expect(render('abc')).rejects.toThrow('REDIRECT https://claude.ai/cb?code=1');
  });

  it('approve e deny seguem a URL devolvida pelo Supabase', async () => {
    auth.oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/ok' }, error: null });
    auth.oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/no' }, error: null });
    await expect(approve('abc')).rejects.toThrow('REDIRECT https://claude.ai/ok');
    await expect(deny('abc')).rejects.toThrow('REDIRECT https://claude.ai/no');
  });

  it('erro ou id vazio volta para a tela com erro', async () => {
    auth.oauth.approveAuthorization.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(approve('abc')).rejects.toThrow('REDIRECT /oauth/consent?authorization_id=abc&erro=falhou');
    await expect(approve('')).rejects.toThrow('REDIRECT /oauth/consent?erro=invalido');
  });
});
