import { describe, expect, it } from 'vitest';
import { mergeContractStatus, nextChargeStatus, nextContractStatus, planPaymentEvent } from '../src/billing-status';

describe('nextContractStatus', () => {
  it('assina só com o documento concluído', () => {
    expect(nextContractStatus('enviado', { event_type: 'doc_signed', status: 'signed' })).toBe('assinado');
    expect(nextContractStatus('enviado', { event_type: 'doc_signed', status: 'pending' })).toBe('enviado');
  });
  it('registra a recusa', () => {
    expect(nextContractStatus('enviado', { event_type: 'doc_refused', status: 'recusado' })).toBe('recusado');
  });
  it('não regride contrato assinado', () => {
    expect(nextContractStatus('assinado', { event_type: 'doc_signed', status: 'signed' })).toBe('assinado');
    expect(nextContractStatus('assinado', { event_type: 'doc_refused', status: 'recusado' })).toBe('assinado');
  });
  it('ignora outros eventos', () => {
    expect(nextContractStatus('enviado', { event_type: 'doc_created', status: 'pending' })).toBe('enviado');
  });
});

describe('nextChargeStatus', () => {
  it('marca como pago ao receber ou confirmar', () => {
    expect(nextChargeStatus('pendente', 'PAYMENT_RECEIVED')).toBe('pago');
    expect(nextChargeStatus('pendente', 'PAYMENT_CONFIRMED')).toBe('pago');
    expect(nextChargeStatus('vencido', 'PAYMENT_RECEIVED')).toBe('pago');
  });
  it('marca como vencido', () => expect(nextChargeStatus('pendente', 'PAYMENT_OVERDUE')).toBe('vencido'));
  it('não regride cobrança paga por evento atrasado', () => {
    expect(nextChargeStatus('pago', 'PAYMENT_OVERDUE')).toBe('pago');
  });
  it('cancela ao excluir e reabre ao restaurar', () => {
    expect(nextChargeStatus('pendente', 'PAYMENT_DELETED')).toBe('cancelado');
    expect(nextChargeStatus('cancelado', 'PAYMENT_RESTORED')).toBe('pendente');
  });
  it('estorno cancela a cobrança', () => {
    expect(nextChargeStatus('pago', 'PAYMENT_REFUNDED')).toBe('cancelado');
  });
  it('mantém o status em evento desconhecido', () => {
    expect(nextChargeStatus('pendente', 'PAYMENT_UPDATED')).toBe('pendente');
  });
});

describe('planPaymentEvent', () => {
  const payment = { id: 'pay_1', subscription: 'sub_1', value: 89, dueDate: '2026-12-10', billingType: 'PIX', description: 'Mensalidade', invoiceUrl: 'https://i' };
  it('atualiza o status da cobrança conhecida', () => {
    expect(planPaymentEvent('PAYMENT_RECEIVED', payment, { status: 'pendente' }, null)).toEqual({ action: 'update', status: 'pago' });
  });
  it('não faz nada em evento repetido', () => {
    expect(planPaymentEvent('PAYMENT_RECEIVED', payment, { status: 'pago' }, null)).toEqual({ action: 'ignore' });
  });
  it('cria a cobrança nova de uma assinatura', () => {
    expect(planPaymentEvent('PAYMENT_CREATED', payment, null, 's1')).toEqual({
      action: 'create',
      row: { service_id: 's1', description: 'Mensalidade', amount_cents: 8900, due_date: '2026-12-10', method: 'pix', status: 'pendente', payment_url: 'https://i', asaas_payment_id: 'pay_1' },
    });
  });
  it('ignora pagamento sem cobrança nem assinatura conhecidas', () => {
    expect(planPaymentEvent('PAYMENT_CREATED', { ...payment, subscription: null }, null, null)).toEqual({ action: 'ignore' });
  });
  it('mantém os centavos de valores quebrados', () => {
    const out = planPaymentEvent('PAYMENT_CREATED', { ...payment, value: 19.9 }, null, 's1');
    expect(out.action === 'create' && out.row.amount_cents).toBe(1990);
  });
});

describe('mergeContractStatus', () => {
  it('avança e nunca regride', () => {
    expect(mergeContractStatus('enviado', 'assinado')).toBe('assinado');
    expect(mergeContractStatus('enviado', 'recusado')).toBe('recusado');
    expect(mergeContractStatus('assinado', 'enviado')).toBe('assinado');
    expect(mergeContractStatus('assinado', 'recusado')).toBe('assinado');
    expect(mergeContractStatus('recusado', 'enviado')).toBe('recusado');
  });
  it('webhook repetido não muda nada', () => {
    expect(mergeContractStatus('enviado', 'enviado')).toBe('enviado');
    expect(mergeContractStatus('recusado', 'recusado')).toBe('recusado');
  });
  it('fora de ordem: recusado e depois assinado vira assinado; assinado e depois enviado fica assinado', () => {
    expect(mergeContractStatus('recusado', 'assinado')).toBe('assinado');
    expect(mergeContractStatus(mergeContractStatus('enviado', 'assinado'), 'enviado')).toBe('assinado');
  });
});
