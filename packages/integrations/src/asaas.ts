import { requireOptional } from '@lps/config';
import { normalizeDocument, type ChargeMethod } from '@lps/domain';

type ClientFields = { id: string; legal_name: string; document: string; email: string | null; phone: string | null };
type ChargeFields = { id: string; description: string; amount_cents: number; due_date: string; method: ChargeMethod };

const BILLING: Record<ChargeMethod, 'PIX' | 'BOLETO' | 'CREDIT_CARD'> = { pix: 'PIX', boleto: 'BOLETO', cartao: 'CREDIT_CARD' };
export const toAsaasBillingType = (method: ChargeMethod) => BILLING[method];
const digits = (v: string) => v.replace(/\D/g, '');

export function buildCustomerPayload(client: ClientFields) {
  return {
    name: client.legal_name,
    cpfCnpj: normalizeDocument(client.document),
    email: client.email ?? undefined,
    mobilePhone: client.phone ? digits(client.phone).replace(/^55(?=\d{10,11}$)/, '') : undefined,
    externalReference: client.id,
    notificationDisabled: true,
  };
}

export function buildPaymentPayload(charge: ChargeFields, customerId: string) {
  return {
    customer: customerId,
    billingType: toAsaasBillingType(charge.method),
    value: charge.amount_cents / 100,
    dueDate: charge.due_date,
    description: charge.description,
    externalReference: charge.id,
  };
}

export type AsaasCycle = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';

export function buildSubscriptionPayload(charge: ChargeFields, customerId: string, cycle: AsaasCycle) {
  return {
    customer: customerId,
    billingType: toAsaasBillingType(charge.method),
    value: charge.amount_cents / 100,
    nextDueDate: charge.due_date,
    cycle,
    description: charge.description,
    externalReference: charge.id,
  };
}

async function call<T>(path: string, method: string, body?: object): Promise<T> {
  const res = await fetch(`${requireOptional('ASAAS_BASE_URL')}${path}`, {
    method,
    headers: { access_token: requireOptional('ASAAS_API_KEY'), 'content-type': 'application/json', 'user-agent': 'landing-page-system' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`O Asaas respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export const createCustomer = (client: ClientFields) => call<{ id: string }>('/customers', 'POST', buildCustomerPayload(client));

export const createPayment = (charge: ChargeFields, customerId: string) =>
  call<{ id: string; invoiceUrl: string; status: string }>('/payments', 'POST', buildPaymentPayload(charge, customerId));

export const createSubscription = (charge: ChargeFields, customerId: string, cycle: AsaasCycle) =>
  call<{ id: string }>('/subscriptions', 'POST', buildSubscriptionPayload(charge, customerId, cycle));

export const deletePayment = (id: string) => call<{ deleted: boolean }>(`/payments/${id}`, 'DELETE');
export const deleteSubscription = (id: string) => call<{ deleted: boolean }>(`/subscriptions/${id}`, 'DELETE');
