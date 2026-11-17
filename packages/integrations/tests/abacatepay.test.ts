import { describe, expect, it, vi } from 'vitest';
import { abacatePay, buildAbacateCustomer, buildCheckout, buildSubscriptionCheckout, createAbacateCharge } from '../src/abacatepay';

const client = { id: 'c1', legal_name: 'Amigo Fiel Ltda', document: '11.222.333/0001-81', email: 'm@x.com', phone: '+55 (19) 99123-4567' };
const charge = { id: 'ch1', description: 'Site', amount_cents: 120000, due_date: '2026-12-10', method: 'pix' as const };
const service = { id: 's1', name: 'Site', cycle: 'mensal', kind: 'unico' as const };

describe('AbacatePay: payloads', () => {
  it('cliente sem pontuação no documento e sem o 55 no celular', () => {
    expect(buildAbacateCustomer(client)).toEqual({ email: 'm@x.com', name: 'Amigo Fiel Ltda', taxId: '11222333000181', cellphone: '19991234567', metadata: { client_id: 'c1' } });
  });
  it('sem e-mail não cadastra cliente (o checkout pede os dados)', () => {
    expect(buildAbacateCustomer({ ...client, email: null })).toBeNull();
  });
  it('vencimento só vai no boleto', () => {
    expect(buildCheckout(charge, 'prod_1', null)).toEqual({ items: [{ id: 'prod_1', quantity: 1 }], methods: ['PIX'], externalId: 'ch1', metadata: { charge_id: 'ch1' } });
    expect(buildCheckout({ ...charge, method: 'boleto' }, 'prod_1', 'cust_1')).toMatchObject({ methods: ['BOLETO'], dueDate: '2026-12-10', customerId: 'cust_1' });
  });
  it('assinatura no boleto é recusada antes de chamar a API', () => {
    expect(() => buildSubscriptionCheckout(service, { ...charge, method: 'boleto' }, 'p', null)).toThrow(/boleto/);
  });
});

function fakeFetch(responses: Record<string, unknown>) {
  const calls: { path: string; body: unknown; auth: string }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.abacatepay.com/v2', '').split('?')[0]!;
    calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : null, auth: String((init.headers as Record<string, string>).authorization) });
    if (!(path in responses)) return new Response(JSON.stringify({ data: null, error: 'Insufficient permissions', success: false }), { status: 401 });
    return new Response(JSON.stringify({ data: responses[path], error: null, success: true }), { status: 200 });
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

describe('AbacatePay: cobrança', () => {
  it('avulsa: cliente, produto e checkout, com a chave do workspace', async () => {
    const { calls, fetcher } = fakeFetch({ '/customers/create': { id: 'cust_1' }, '/products/create': { id: 'prod_1' }, '/checkouts/create': { id: 'bill_1', url: 'https://pay/bill_1', status: 'PENDING' } });
    const out = await createAbacateCharge(abacatePay('abc_dev_ws1', fetcher), { client, service, charge });
    expect(out.url).toBe('https://pay/bill_1');
    expect(calls.map((c) => c.path)).toEqual(['/customers/create', '/products/create', '/checkouts/create']);
    expect(calls.every((c) => c.auth === 'Bearer abc_dev_ws1')).toBe(true);
    expect(calls[2]!.body).toMatchObject({ customerId: 'cust_1', items: [{ id: 'prod_1', quantity: 1 }] });
  });
  it('recorrente: produto com ciclo e checkout de assinatura', async () => {
    const { calls, fetcher } = fakeFetch({ '/customers/create': { id: 'cust_1' }, '/products/create': { id: 'prod_2' }, '/subscriptions/create': { id: 'bill_2', url: 'https://pay/bill_2', status: 'PENDING' } });
    await createAbacateCharge(abacatePay('abc_dev_ws1', fetcher), { client, service: { ...service, kind: 'recorrente', cycle: 'trimestral' }, charge: { ...charge, method: 'cartao' } });
    expect(calls[1]!.body).toMatchObject({ cycle: 'QUARTERLY', price: 120000 });
    expect(calls[2]).toMatchObject({ path: '/subscriptions/create', body: { methods: ['CARD'], items: [{ id: 'prod_2', quantity: 1 }] } });
  });
  it('erro da AbacatePay vira mensagem legível', async () => {
    const { fetcher } = fakeFetch({});
    await expect(abacatePay('abc_dev_x', fetcher).createWebhook('https://x.test/h', 's'.repeat(64))).rejects.toThrow('A AbacatePay recusou a chave: Insufficient permissions');
  });
});
