import { expect, it } from 'vitest';
import { contractWhatsAppHref } from '@/lib/contracts';

it('monta o link do CRM com o texto do contrato e o link de assinatura', () => {
  const href = contractWhatsAppHref('c1', 'https://app.zapsign.com.br/verificar/abc?x=1');
  const url = new URL(href!, 'http://x');
  expect(url.pathname).toBe('/painel/crm');
  expect(url.searchParams.get('contato')).toBe('c1');
  expect(url.searchParams.get('texto')).toBe('Segue o contrato para assinatura: https://app.zapsign.com.br/verificar/abc?x=1');
});
it('sem link de assinatura, devolve null', () => {
  expect(contractWhatsAppHref('c1', null)).toBeNull();
});
