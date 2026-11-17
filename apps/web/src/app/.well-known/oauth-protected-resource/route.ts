import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler';

/** Metadados do recurso protegido (RFC 9728): o servidor de autorização é o Supabase Auth. */
export function GET(req: Request): Response {
  const resourceUrl = process.env.APP_URL?.replace(/\/+$/, '') || undefined;
  return protectedResourceHandler({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
