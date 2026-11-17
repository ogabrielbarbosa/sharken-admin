import { createServerClient } from '@/lib/supabase/server';

/** Endereço do servidor MCP a partir do endereço do painel (APP_URL). */
export function mcpEndpoint(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/mcp`;
}

export type McpConnection = { clientId: string; name: string; site: string | null; grantedAt: string };

function hostOf(uri: string): string | null {
  try {
    return uri ? new URL(uri).host : null;
  } catch {
    return null;
  }
}

/** Ferramentas que o usuário logado autorizou pelo OAuth (Claude, Cursor…). null se o Supabase falhar. */
export async function listMcpConnections(): Promise<McpConnection[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error || !data) return null;
  return data
    .map((g) => ({ clientId: g.client.id, name: g.client.name || 'Cliente sem nome', site: hostOf(g.client.uri), grantedAt: g.granted_at }))
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}
