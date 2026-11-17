import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler';

const PREFIX = /^\/\.well-known\/oauth-protected-resource/;

/**
 * Metadados do recurso protegido (RFC 9728): o servidor de autorização é o Supabase Auth. Responde também com o
 * caminho do recurso no fim (`/.well-known/oauth-protected-resource/api/mcp`), como alguns clientes pedem.
 */
export function GET(req: Request): Response {
  const base = process.env.APP_URL?.replace(/\/+$/, '');
  const suffix = new URL(req.url).pathname.replace(PREFIX, '').replace(/\/+$/, '');
  return protectedResourceHandler({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: base ? `${base}${suffix}` : undefined,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
