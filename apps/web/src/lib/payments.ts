import { MESSAGES } from '@lps/config/messages';
import { fillPaymentMessage, formatBRL } from '@lps/domain';

/** Abre o CRM na conversa do contato com o link de pagamento já escrito no campo de envio. */
export function paymentWhatsAppHref(contactId: string, charge: { description: string; amount_cents: number; due_date: string; payment_url: string | null }): string | null {
  if (!charge.payment_url) return null;
  const texto = fillPaymentMessage(MESSAGES.pagamento, { description: charge.description, value: formatBRL(charge.amount_cents), dueDate: charge.due_date, link: charge.payment_url });
  return `/painel/crm?${new URLSearchParams({ contato: contactId, texto })}`;
}
