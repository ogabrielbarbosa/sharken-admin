'use server';

import { getCharge, getService } from '@lps/db';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { openClientConversation } from '@/lib/client-whatsapp';
import { paymentWhatsAppHref } from '@/lib/payments';

const BACK = '/painel/pagamentos';

/** Leva ao CRM, na conversa do cliente, com o link de pagamento escrito no campo. Um clique do Gabriel envia. */
export async function whatsappPaymentAction(form: FormData) {
  const db = await authedDb();
  const charge = await getCharge(db, String(form.get('chargeId') ?? ''));
  const service = charge && (await getService(db, charge.service_id));
  if (!charge || !service) redirect(`${BACK}?erro=${encodeURIComponent('Cobrança não encontrada.')}`);
  await openClientConversation({
    clientId: service.client_id,
    back: BACK,
    href: (contactId) => paymentWhatsAppHref(contactId, charge),
    missing: 'A cobrança ainda não tem link de pagamento.',
  });
}
