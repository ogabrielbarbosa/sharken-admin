'use server';

import { createContact, findContactByPhone, getClient, getContact, updateClient } from '@lps/db';
import { toMobileE164 } from '@lps/domain';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { contractWhatsAppHref } from '@/lib/contracts';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const BACK = '/painel/contratos';
const withError = (message: string) => `${BACK}?erro=${encodeURIComponent(message)}`;

/**
 * Leva ao CRM, na conversa do cliente, com o contrato escrito no campo. Cliente sem contato no CRM
 * ganha um contato manual (celular válido, mesmo número não duplica). O envio continua sendo um clique no CRM.
 */
export async function whatsappContractAction(form: FormData) {
  const db = await authedDb();
  const client = await getClient(db, text(form, 'clientId'));
  const signUrl = text(form, 'signUrl') || null;
  if (!client) redirect(withError('Cliente não encontrado.'));
  let contactId = client.contact_id;
  if (!contactId || !(await getContact(db, contactId))) {
    const phone = toMobileE164(client.phone);
    if (!phone) redirect(withError('O cliente não tem celular válido. Corrija o telefone no cadastro.'));
    const existing = await findContactByPhone(db, phone);
    const contact = existing ?? (await createContact(db, { name: client.contact_name || client.legal_name, phone_e164: phone, origin: 'manual', status: 'novo' }));
    contactId = contact.id;
    await updateClient(db, client.id, { contact_id: contactId });
  }
  const href = contractWhatsAppHref(contactId, signUrl);
  if (!href) redirect(withError('O contrato ainda não tem link de assinatura.'));
  redirect(href);
}
