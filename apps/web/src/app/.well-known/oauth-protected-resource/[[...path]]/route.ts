import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler';
import { MCP_SCOPES } from '@/lib/mcp/scopes';

const PREFIX = /^\/\.well-known\/oauth-protected-resource/;

/**
 * Metadados do recurso protegido (RFC 9728): o servidor de autorização é o Supabase Auth. Responde também com o
 * caminho do recurso no fim (`/.well-known/oauth-protected-resource/api/mcp`), como alguns clientes pedem.
 */
export async function GET(req: Request): Promise<Response> {
  const base = process.env.APP_URL?.replace(/\/+$/, '');
  const suffix = new URL(req.url).pathname.replace(PREFIX, '').replace(/\/+$/, '');
  const res = protectedResourceHandler({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: base ? `${base}${suffix}` : undefined,
  })(req);
  // Escopos que o cliente deve pedir: sem `openid` (ver MCP_SCOPES).
  const body = { ...(await res.json()), scopes_supported: MCP_SCOPES };
  return new Response(JSON.stringify(body), { status: res.status, headers: res.headers });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
