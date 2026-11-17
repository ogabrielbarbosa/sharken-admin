// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

const auth = {
  getUser: vi.fn(),
  oauth: { getAuthorizationDetails: vi.fn(), approveAuthorization: vi.fn(), denyAuthorization: vi.fn() },
};
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth }) }));

import { renderToStaticMarkup } from 'react-dom/server';
import { approve, deny } from '@/app/oauth/consent/actions';
import ConsentPage from '@/app/oauth/consent/page';
import { redirectHost } from '@/app/oauth/consent/redirect-host';

const render = (id?: string) => ConsentPage({ searchParams: Promise.resolve({ authorization_id: id }) });

beforeEach(() => vi.clearAllMocks());

describe('consentimento OAuth', () => {
  it('sem usuário manda para o login com retorno', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(render('abc')).rejects.toThrow('REDIRECT /login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc');
  });

  it('o id vai codificado dentro do next', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    await expect(render('a&b')).rejects.toThrow('REDIRECT /login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Da%2526b');
  });

  it('mostra o app, para onde volta e com qual conta', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'u', email: 'gabriel@exemplo.com' } } });
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { authorization_id: 'abc', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client: { id: 'c', name: 'Claude' }, user: { id: 'u', email: 'gabriel@exemplo.com' }, scope: '' },
      error: null,
    });
    const html = renderToStaticMarkup(await render('abc'));
    expect(html).toContain('Claude');
    expect(html).toContain('Vai voltar para: <strong>claude.ai</strong>');
    expect(html).toContain('Você está entrando como <strong>gabriel@exemplo.com</strong>');
    expect(html).toContain('Só autorize se foi você que pediu essa conexão agora.');
  });

  it('redirectHost tira só o host do redirect_uri', () => {
    expect(redirectHost('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(redirectHost('http://localhost:6274/oauth/callback')).toBe('localhost:6274');
    expect(redirectHost('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe('cursor://anysphere.cursor-retrieval');
    expect(redirectHost('não é url')).toBe('não é url');
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
