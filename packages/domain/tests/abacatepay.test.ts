import { describe, expect, it } from 'vitest';
import { abacateKeyMode, abacatePaidAt, maskApiKey, nextAbacateChargeStatus, planAbacateEvent, toAbacateCycle, toAbacateMethod, todayInSaoPaulo, type AbacateEvent } from '../src/abacatepay';

const checkout = (extra = {}) => ({ id: 'bill_1', externalId: 'c1', url: 'https://app.abacatepay.com/pay/bill_1', amount: 10000, frequency: 'ONE_TIME', status: 'PAID', ...extra });
const evt = (event: string, data: AbacateEvent['data']): AbacateEvent => ({ id: 'log_1', event, apiVersion: 2, devMode: false, data } as AbacateEvent);

describe('AbacatePay: tradução', () => {
  it('forma de pagamento e ciclo', () => {
    expect(toAbacateMethod('cartao')).toBe('CARD');
    expect(toAbacateMethod('boleto')).toBe('BOLETO');
    expect(toAbacateCycle('anual')).toBe('ANNUALLY');
    expect(toAbacateCycle(null)).toBe('MONTHLY');
  });
  it('reconhece a chave de teste e a de produção', () => {
    expect(abacateKeyMode('abc_dev_xyz123')).toBe('teste');
    expect(abacateKeyMode('abc_prod_xyz123')).toBe('producao');
    expect(abacateKeyMode('$aact_asaas')).toBeNull();
    expect(abacateKeyMode('abc_prod_ com espaço')).toBeNull();
  });
  it('mostra só o começo e o fim da chave', () => {
    expect(maskApiKey('abc_prod_1234567890abcdef')).toBe('abc_prod_…cdef');
  });
  it('hoje em São Paulo, não em UTC', () => {
    expect(todayInSaoPaulo(new Date('2026-11-18T01:30:00Z'))).toBe('2026-11-17');
  });
});

describe('AbacatePay: planAbacateEvent', () => {
  it('checkout avulso pago', () => {
    expect(planAbacateEvent(evt('checkout.completed', { checkout: checkout(), payerInformation: { method: 'CARD' } }))).toEqual({ action: 'checkout_paid', checkoutId: 'bill_1', method: 'cartao' });
  });
  it('ignora o checkout.completed da assinatura (vale o subscription.*)', () => {
    expect(planAbacateEvent(evt('checkout.completed', { checkout: checkout({ frequency: 'SUBSCRIPTION' }) })).action).toBe('ignore');
  });
  it('reembolso e disputa perdida cancelam', () => {
    expect(planAbacateEvent(evt('checkout.refunded', { checkout: checkout() }))).toEqual({ action: 'checkout_reversed', checkoutId: 'bill_1' });
    expect(planAbacateEvent(evt('checkout.lost', { checkout: checkout() })).action).toBe('checkout_reversed');
  });
  it('pagamento de assinatura usa o valor pago', () => {
    const plan = planAbacateEvent(evt('subscription.renewed', {
      checkout: checkout({ frequency: 'SUBSCRIPTION' }), subscription: { id: 'subs_1', method: 'PIX', amount: 2990 },
      payment: { id: 'pix_1', amount: 2990, paidAmount: 2990 },
    }));
    expect(plan).toEqual({ action: 'subscription_paid', checkoutId: 'bill_1', subscriptionId: 'subs_1', paymentId: 'pix_1', amountCents: 2990, method: 'pix' });
  });
  it('falha de cobrança da assinatura usa o ciclo (installmentId)', () => {
    const plan = planAbacateEvent(evt('subscription.payment_failed', {
      checkout: checkout({ frequency: 'SUBSCRIPTION' }), subscription: { id: 'subs_1', method: 'CARD', amount: 2990 },
      payment: { id: 'card_9', amount: 2990, status: 'FAILED' }, installmentId: 'intl_2',
    }));
    expect(plan).toMatchObject({ action: 'subscription_failed', installmentId: 'intl_2', method: 'cartao' });
  });
  it('evento desconhecido ou sem dados é ignorado', () => {
    expect(planAbacateEvent(evt('payout.completed', {})).action).toBe('ignore');
    expect(planAbacateEvent(evt('subscription.renewed', { subscription: { id: 'subs_1' } })).action).toBe('ignore');
  });
});

describe('AbacatePay: status', () => {
  it('pago vale até sobre cobrança cancelada (o dinheiro entrou)', () => {
    expect(nextAbacateChargeStatus('cancelado', { action: 'checkout_paid', checkoutId: 'b', method: null })).toBe('pago');
  });
  it('reembolso cancela', () => {
    expect(nextAbacateChargeStatus('pago', { action: 'checkout_reversed', checkoutId: 'b' })).toBe('cancelado');
  });
  it('data do pagamento vem do pagamento; sem ela, agora', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(abacatePaidAt(evt('x', { payment: { id: 'p', updatedAt: '2026-11-10T10:00:00.000Z' } }), now)).toBe('2026-11-10T10:00:00.000Z');
    expect(abacatePaidAt(evt('x', {}), now)).toBe(now.toISOString());
  });
});
