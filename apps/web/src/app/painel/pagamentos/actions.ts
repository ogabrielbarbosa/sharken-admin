'use server';

import { getCharge, getService } from '@lps/db';
import { redirect, unstable_rethrow } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { openClientConversation } from '@/lib/client-whatsapp';
import { paymentWhatsAppHref } from '@/lib/payments';

const BACK = '/painel/pagamentos';
const withError = (message: string) => `${BACK}?erro=${encodeURIComponent(message)}`;

/** Leva ao CRM, na conversa do cliente, com o link de pagamento escrito no campo. Um clique do Gabriel envia. */
export async function whatsappPaymentAction(form: FormData) {
  let charge: Awaited<ReturnType<typeof getCharge>>;
  let clientId: string | undefined;
  try {
    const db = await authedDb();
    charge = await getCharge(db, String(form.get('chargeId') ?? ''));
    clientId = charge ? (await getService(db, charge.service_id))?.client_id : undefined;
  } catch (err) {
    unstable_rethrow(err);
    redirect(withError('Não foi possível abrir a conversa. Tente de novo.'));
  }
  if (!charge || !clientId) redirect(withError('Cobrança não encontrada.'));
  const found = charge;
  await openClientConversation({
    clientId,
    back: BACK,
    href: (contactId) => paymentWhatsAppHref(contactId, found),
    missing: 'A cobrança ainda não tem link de pagamento.',
  });
}
