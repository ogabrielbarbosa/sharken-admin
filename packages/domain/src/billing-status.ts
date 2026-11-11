import type { ChargeMethod, ChargeStatus, ContractStatus } from './finance';

export function nextContractStatus(current: ContractStatus, event: { event_type?: string; status?: string }): ContractStatus {
  if (current === 'assinado') return current;
  if (event.event_type === 'doc_signed' && event.status === 'signed') return 'assinado';
  if (event.event_type === 'doc_refused') return 'recusado';
  return current;
}

const CONTRACT_RANK: Record<ContractStatus, number> = { rascunho: 0, enviado: 1, recusado: 2, assinado: 3 };

/** Aplica o status vindo do provedor sem regredir: assinado é final e recusado só cede à assinatura. */
export function mergeContractStatus(current: ContractStatus, incoming: 'enviado' | 'assinado' | 'recusado'): ContractStatus {
  if (current === 'assinado') return current;
  if (current === 'recusado') return incoming === 'assinado' ? incoming : current;
  return CONTRACT_RANK[incoming] > CONTRACT_RANK[current] ? incoming : current;
}

export function nextChargeStatus(current: ChargeStatus, event: string): ChargeStatus {
  switch (event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      return 'pago';
    case 'PAYMENT_OVERDUE':
      return current === 'pago' ? current : 'vencido';
    case 'PAYMENT_DELETED':
    case 'PAYMENT_REFUNDED':
      return 'cancelado';
    case 'PAYMENT_RESTORED':
      return 'pendente';
    default:
      return current;
  }
}

export type AsaasPayment = {
  id: string;
  subscription?: string | null;
  value: number;
  dueDate: string;
  billingType: string;
  description?: string | null;
  invoiceUrl?: string | null;
};

const METHODS: Record<string, ChargeMethod> = { PIX: 'pix', BOLETO: 'boleto', CREDIT_CARD: 'cartao', UNDEFINED: 'pix' };

export type PaymentPlan =
  | { action: 'ignore' }
  | { action: 'update'; status: ChargeStatus }
  | { action: 'create'; row: { service_id: string; description: string; amount_cents: number; due_date: string; method: ChargeMethod; status: ChargeStatus; payment_url: string | null; asaas_payment_id: string } };

export function planPaymentEvent(event: string, payment: AsaasPayment, existing: { status: ChargeStatus } | null, subscriptionServiceId: string | null): PaymentPlan {
  if (existing) {
    const status = nextChargeStatus(existing.status, event);
    return status === existing.status ? { action: 'ignore' } : { action: 'update', status };
  }
  if (!subscriptionServiceId) return { action: 'ignore' };
  return {
    action: 'create',
    row: {
      service_id: subscriptionServiceId,
      description: payment.description ?? 'Mensalidade',
      amount_cents: Math.round(payment.value * 100),
      due_date: payment.dueDate,
      method: METHODS[payment.billingType] ?? 'pix',
      status: nextChargeStatus('pendente', event),
      payment_url: payment.invoiceUrl ?? null,
      asaas_payment_id: payment.id,
    },
  };
}
