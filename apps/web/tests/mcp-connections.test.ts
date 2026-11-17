// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oauth = { listGrants: vi.fn(), revokeGrant: vi.fn() };
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({ auth: { oauth } }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock('@/lib/auth', () => ({ getSession: async () => ({ user: { id: 'u1' }, isAdmin: false, workspace: { id: 'w1', role: 'member' } }) }));

import { listMcpConnections, mcpEndpoint } from '@/lib/mcp/connections';
import { revokeMcpConnectionAction } from '@/app/painel/configuracoes/actions';

beforeEach(() => vi.clearAllMocks());

describe('mcpEndpoint', () => {
  it('junta o endereço do painel com /api/mcp, com ou sem barra no fim', () => {
    expect(mcpEndpoint('https://admin.sharkenapps.com')).toBe('https://admin.sharkenapps.com/api/mcp');
    expect(mcpEndpoint('https://admin.sharkenapps.com/')).toBe('https://admin.sharkenapps.com/api/mcp');
  });
});

describe('listMcpConnections', () => {
  it('devolve as conexões autorizadas, mais recentes primeiro', async () => {
    oauth.listGrants.mockResolvedValue({
      data: [
        { client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' }, scopes: ['email'], granted_at: '2026-11-10T10:00:00Z' },
        { client: { id: 'c2', name: 'Claude Code', uri: '', logo_uri: '' }, scopes: [], granted_at: '2026-11-17T10:00:00Z' },
      ],
      error: null,
    });
    expect(await listMcpConnections()).toEqual([
      { clientId: 'c2', name: 'Claude Code', site: null, grantedAt: '2026-11-17T10:00:00Z' },
      { clientId: 'c1', name: 'Claude', site: 'claude.ai', grantedAt: '2026-11-10T10:00:00Z' },
    ]);
  });

  it('devolve null quando o Supabase falha, para a tela avisar sem quebrar', async () => {
    oauth.listGrants.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await listMcpConnections()).toBeNull();
  });
});

describe('revokeMcpConnectionAction', () => {
  const form = (clientId: string) => { const f = new FormData(); f.set('client_id', clientId); return f; };

  it('revoga a conexão do próprio usuário e volta para a aba MCP', async () => {
    oauth.revokeGrant.mockResolvedValue({ data: {}, error: null });
    await expect(revokeMcpConnectionAction(form('c1'))).rejects.toThrow(/REDIRECT \/painel\/configuracoes\?aba=mcp&ok=/);
    expect(oauth.revokeGrant).toHaveBeenCalledWith({ clientId: 'c1' });
  });

  it('avisa o erro quando a revogação falha', async () => {
    oauth.revokeGrant.mockResolvedValue({ data: null, error: { message: 'x' } });
    await expect(revokeMcpConnectionAction(form('c1'))).rejects.toThrow(/aba=mcp&erro=/);
  });

  it('não chama o Supabase sem client_id', async () => {
    await expect(revokeMcpConnectionAction(form(''))).rejects.toThrow(/aba=mcp&erro=/);
    expect(oauth.revokeGrant).not.toHaveBeenCalled();
  });
});
