'use server';

import { getClient, resolveClientContact } from '@lps/db';
import { redirect, unstable_rethrow } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { contractWhatsAppHref } from '@/lib/contracts';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const withError = (message: string) => `/painel/contratos?erro=${encodeURIComponent(message)}`;

/**
 * Leva ao CRM, na conversa do cliente, com o contrato escrito no campo. Não cria nem liga contato de quem
 * pediu para parar. O envio continua sendo um clique no CRM.
 */
export async function whatsappContractAction(form: FormData) {
  let href: string;
  try {
    const db = await authedDb();
    const client = await getClient(db, text(form, 'clientId'));
    if (!client) redirect(withError('Cliente não encontrado.'));
    const out = await resolveClientContact(db, client);
    if ('blocked' in out) redirect(withError(out.blocked));
    const link = contractWhatsAppHref(out.contactId, text(form, 'signUrl') || null);
    if (!link) redirect(withError('O contrato ainda não tem link de assinatura.'));
    href = link;
  } catch (err) {
    unstable_rethrow(err);
    redirect(withError('Não foi possível abrir a conversa. Tente de novo.'));
  }
  redirect(href);
}
