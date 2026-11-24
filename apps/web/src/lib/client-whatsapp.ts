import { getClient, resolveClientContact } from '@lps/db';
import { redirect, unstable_rethrow } from 'next/navigation';
import { authedDb, getSession } from '@/lib/auth';

/**
 * Leva ao CRM, na conversa do cliente, com o texto já no campo. Cria o contato manual quando o cliente
 * não tem um e não mexe em quem pediu para parar. O envio continua sendo um clique no CRM.
 * `href` recebe o contato e devolve o destino (ou um motivo, em `missing`, se não der para montar).
 */
export async function openClientConversation(opts: { clientId: string; back: string; href: (contactId: string) => string | null; missing: string }): Promise<never> {
  const withError = (message: string) => `${opts.back}${opts.back.includes('?') ? '&' : '?'}erro=${encodeURIComponent(message)}`;
  let target: string;
  try {
    const db = await authedDb();
    const client = await getClient(db, opts.clientId);
    if (!client) redirect(withError('Cliente não encontrado.'));
    const out = await resolveClientContact(db, client, (await getSession()).user.id);
    if ('blocked' in out) redirect(withError(out.blocked));
    const link = opts.href(out.contactId);
    if (!link) redirect(withError(opts.missing));
    target = link;
  } catch (err) {
    unstable_rethrow(err);
    redirect(withError('Não foi possível abrir a conversa. Tente de novo.'));
  }
  redirect(target);
}
