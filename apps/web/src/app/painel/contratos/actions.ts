'use server';

import { contractWhatsAppHref } from '@/lib/contracts';
import { openClientConversation } from '@/lib/client-whatsapp';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Leva ao CRM, na conversa do cliente, com o contrato escrito no campo. */
export async function whatsappContractAction(form: FormData) {
  const signUrl = text(form, 'signUrl') || null;
  await openClientConversation({
    clientId: text(form, 'clientId'),
    back: '/painel/contratos',
    href: (contactId) => contractWhatsAppHref(contactId, signUrl),
    missing: 'O contrato ainda não tem link de assinatura.',
  });
}
