import { ABACATE_WEBHOOK_EVENTS, normalizeDocument, toAbacateCycle, toAbacateMethod, type ChargeMethod } from '@lps/domain';

/** API v2 da AbacatePay. O ambiente (teste ou produção) vem da chave, não da URL. */
const BASE_URL = 'https://api.abacatepay.com/v2';

type ClientFields = { id: string; legal_name: string; document: string; email: string | null; phone: string | null };
type ChargeFields = { id: string; description: string; amount_cents: number; due_date: string; method: ChargeMethod };
type ServiceFields = { id: string; name: string; cycle: string | null };

const digits = (v: string) => v.replace(/\D/g, '');

/** Cliente da AbacatePay. Sem e-mail não dá para cadastrar (é obrigatório lá): o checkout pede os dados. */
export function buildAbacateCustomer(client: ClientFields) {
  if (!client.email) return null;
  const phone = client.phone ? digits(client.phone).replace(/^55(?=\d{10,11}$)/, '') : '';
  return {
    email: client.email,
    name: client.legal_name,
    taxId: normalizeDocument(client.document),
    ...(phone ? { cellphone: phone } : {}),
    metadata: { client_id: client.id },
  };
}

/** Produto avulso da cobrança: a AbacatePay só cria checkout a partir de produto. */
export function buildChargeProduct(charge: ChargeFields) {
  return { externalId: `charge-${charge.id}`, name: charge.description, price: charge.amount_cents, currency: 'BRL' };
}

/** Produto de assinatura do serviço, com o ciclo. Um por checkout de assinatura (`stamp` evita repetir o externalId). */
export function buildSubscriptionProduct(service: ServiceFields, charge: ChargeFields, stamp: string) {
  return { externalId: `service-${service.id}-${stamp}`, name: charge.description, price: charge.amount_cents, currency: 'BRL', cycle: toAbacateCycle(service.cycle) };
}

/** Checkout avulso. Vencimento só existe no boleto; nas outras formas, o sistema marca o atraso pela data. */
export function buildCheckout(charge: ChargeFields, productId: string, customerId: string | null) {
  const method = toAbacateMethod(charge.method);
  return {
    items: [{ id: productId, quantity: 1 }],
    methods: [method],
    externalId: charge.id,
    ...(customerId ? { customerId } : {}),
    ...(method === 'BOLETO' ? { dueDate: charge.due_date } : {}),
    metadata: { charge_id: charge.id },
  };
}

/** Checkout de assinatura: cartão ou Pix Automático. Boleto não existe em assinatura na AbacatePay. */
export function buildSubscriptionCheckout(service: ServiceFields, charge: ChargeFields, productId: string, customerId: string | null) {
  if (charge.method === 'boleto') throw new Error('A AbacatePay não faz assinatura no boleto. Escolha Pix ou cartão.');
  return {
    items: [{ id: productId, quantity: 1 }],
    methods: [toAbacateMethod(charge.method)],
    externalId: charge.id,
    ...(customerId ? { customerId } : {}),
    metadata: { service_id: service.id, charge_id: charge.id },
  };
}

type Checkout = { id: string; url: string; status: string };

export class AbacateError extends Error {}

/** Cliente da API preso a uma chave: cada workspace usa a sua. */
export function abacatePay(apiKey: string, fetcher: typeof fetch = fetch) {
  async function call<T>(path: string, body?: object): Promise<T> {
    const res = await fetcher(`${BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'user-agent': 'sharken-admin' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: string | null } | null;
    if (!res.ok || !json || json.error) {
      const reason = json?.error ?? `HTTP ${res.status}`;
      throw new AbacateError(res.status === 401 ? `A AbacatePay recusou a chave: ${reason}` : `A AbacatePay respondeu: ${reason}`);
    }
    return json.data as T;
  }

  return {
    createCustomer: (client: ClientFields) => {
      const body = buildAbacateCustomer(client);
      return body ? call<{ id: string }>('/customers/create', body).then((c) => c.id) : Promise.resolve(null);
    },
    createProduct: (body: ReturnType<typeof buildChargeProduct> | ReturnType<typeof buildSubscriptionProduct>) => call<{ id: string }>('/products/create', body),
    createCheckout: (body: ReturnType<typeof buildCheckout>) => call<Checkout>('/checkouts/create', body),
    createSubscriptionCheckout: (body: ReturnType<typeof buildSubscriptionCheckout>) => call<Checkout>('/subscriptions/create', body),
    cancelSubscription: (id: string) => call<{ id: string; status: string }>('/subscriptions/cancel', { id }),
    /** Tira do ar o link de uma assinatura ainda não paga. */
    deleteSubscriptionCheckout: (id: string) => call<unknown>(`/subscriptions/checkouts/delete?id=${encodeURIComponent(id)}`, {}),
    createWebhook: (endpoint: string, secret: string) =>
      call<{ id: string }>('/webhooks/create', { name: 'Sharken Admin', endpoint, secret, events: [...ABACATE_WEBHOOK_EVENTS] }),
    deleteWebhook: (id: string) => call<unknown>(`/webhooks/delete?id=${encodeURIComponent(id)}`, {}),
  };
}

export type AbacatePayClient = ReturnType<typeof abacatePay>;

/**
 * Cria a cobrança na AbacatePay e devolve o checkout. Avulsa: produto + checkout. Recorrente: produto com
 * ciclo + checkout de assinatura; a assinatura passa a existir quando o cliente paga o link.
 */
export async function createAbacateCharge(api: AbacatePayClient, input: { client: ClientFields; service: ServiceFields & { kind: 'unico' | 'recorrente' }; charge: ChargeFields }) {
  const customerId = await api.createCustomer(input.client);
  if (input.service.kind === 'recorrente') {
    const body = buildSubscriptionCheckout(input.service, input.charge, '', customerId); // valida a forma antes de criar o produto
    const product = await api.createProduct(buildSubscriptionProduct(input.service, input.charge, Date.now().toString(36)));
    return api.createSubscriptionCheckout({ ...body, items: [{ id: product.id, quantity: 1 }] });
  }
  const product = await api.createProduct(buildChargeProduct(input.charge));
  return api.createCheckout(buildCheckout(input.charge, product.id, customerId));
}
