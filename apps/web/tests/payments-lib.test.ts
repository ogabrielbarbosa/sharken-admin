import { expect, it } from 'vitest';
import { paymentWhatsAppHref } from '@/lib/payments';

const charge = { description: 'Site Mundo Pet', amount_cents: 150000, due_date: '2026-11-20', payment_url: 'https://www.asaas.com/i/abc' };

it('monta o link do CRM com o texto da cobrança preenchido', () => {
  const url = new URL(paymentWhatsAppHref('c1', charge)!, 'http://x');
  expect(url.pathname).toBe('/painel/crm');
  expect(url.searchParams.get('contato')).toBe('c1');
  const texto = url.searchParams.get('texto')!;
  expect(texto.replace(/\s/g, ' ')).toBe('Segue o link para pagamento de Site Mundo Pet, no valor de R$ 1.500,00, com vencimento em 20/11/2026: https://www.asaas.com/i/abc');
});
it('sem link de pagamento, devolve null', () => {
  expect(paymentWhatsAppHref('c1', { ...charge, payment_url: null })).toBeNull();
});
