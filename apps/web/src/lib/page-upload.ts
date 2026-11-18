import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Link de upload da página: o MCP (`preparar_upload_da_pagina`) assina o que vai ser publicado e o agente sobe o
 * arquivo com `curl`, sem redigitar o HTML numa chamada de ferramenta. Sem estado: o token carrega tudo e vence sozinho.
 */
export type UploadGrant = {
  /** lead */
  l: string;
  /** workspace do lead */
  w: string;
  /** quem pediu */
  u: string;
  /** id da página: a que será criada ou a que será trocada */
  p: string;
  /** true = página nova (reenviar com o mesmo link só troca o HTML dela) */
  n: boolean;
  t?: string | null;
  /** horas até expirar; ausente mantém, null não expira */
  e?: number | null;
  /** validade do link (ms desde 1970) */
  x: number;
};

export const UPLOAD_TTL_MS = 30 * 60_000;

function key(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
  return `page-upload:${secret}`;
}

const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

export function signUpload(grant: Omit<UploadGrant, 'x'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...grant, x: now + UPLOAD_TTL_MS })).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** O conteúdo do token, ou null se a assinatura não bate ou o link venceu. */
export function verifyUpload(token: string | null, now = Date.now()): UploadGrant | null {
  const [body, mac, extra] = (token ?? '').split('.');
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const grant = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UploadGrant;
    return typeof grant.x === 'number' && grant.x > now ? grant : null;
  } catch {
    return null;
  }
}
