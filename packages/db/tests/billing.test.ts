import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { AbacateEvent } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAbacateEvent, createCatalogItem, getWorkspaceBilling, listCatalog, saveWorkspaceBilling, updateCatalogItem } from '../src/billing';
import { createClient, createService, getService, insertCharge, listCharges } from '../src/clients';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let raw: ReturnType<typeof fakeDb>;
let a: ReturnType<typeof fakeDb>;
let b: ReturnType<typeof fakeDb>;
let wsA: string;
let wsB: string;
let n = 0;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  raw = fakeDb(pg);
  wsA = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
  wsB = ((await pg.query(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`)).rows[0] as { id: string }).id;
  a = scopeDb(raw, wsA);
  b = scopeDb(raw, wsB);
});

async function serviceWith(db: ReturnType<typeof fakeDb>, kind: 'unico' | 'recorrente' = 'unico') {
  const client = await createClient(db, { legal_name: `Cliente ${++n}`, document: '52998224725' });
  return createService(db, { client_id: client.id, name: `Serviço ${n}`, kind, amount_cents: 2990, start_date: '2026-11-17', cycle: kind === 'recorrente' ? 'mensal' : null, payment_method: 'cartao' });
}
const evt = (event: string, data: AbacateEvent['data']): AbacateEvent => ({ event, devMode: false, data });
const subCheckout = (id: string) => ({ id, frequency: 'SUBSCRIPTION', updatedAt: '2026-11-17T12:00:00Z' });

describe('credencial por workspace', () => {
  it('cada workspace guarda a sua chave', async () => {
    await saveWorkspaceBilling(raw, { workspace_id: wsA, api_key: 'abc_dev_A', dev_mode: true, webhook_id: 'wh_a', webhook_secret: 'a'.repeat(64) });
    await saveWorkspaceBilling(raw, { workspace_id: wsB, api_key: 'abc_prod_B', dev_mode: false, webhook_id: 'wh_b', webhook_secret: 'b'.repeat(64) });
    await saveWorkspaceBilling(raw, { workspace_id: wsA, api_key: 'abc_prod_A2', dev_mode: false, webhook_id: 'wh_a2', webhook_secret: 'c'.repeat(64) });
    expect((await getWorkspaceBilling(raw, wsA))?.api_key).toBe('abc_prod_A2');
    expect((await getWorkspaceBilling(raw, wsB))?.api_key).toBe('abc_prod_B');
  });
});

describe('catálogo', () => {
  it('cada workspace vê o próprio catálogo; arquivado sai do Fechar negócio', async () => {
    await createCatalogItem(a, { name: 'Site', kind: 'unico', amount_cents: 120000, cycle: 'mensal', description: null });
    await createCatalogItem(a, { name: 'Manutenção', kind: 'recorrente', amount_cents: 8900, cycle: 'mensal', description: 'Hospedagem e ajustes' });
    await createCatalogItem(b, { name: 'Landing page', kind: 'unico', amount_cents: 50000, cycle: null, description: null });
    const mine = await listCatalog(a);
    expect(mine.map((i) => i.name).sort()).toEqual(['Manutenção', 'Site']);
    expect(mine.find((i) => i.name === 'Site')?.cycle).toBeNull(); // único não guarda periodicidade
    await updateCatalogItem(a, mine.find((i) => i.name === 'Site')!.id, { active: false });
    expect((await listCatalog(a, { onlyActive: true })).map((i) => i.name)).toEqual(['Manutenção']);
    expect((await listCatalog(b)).map((i) => i.name)).toEqual(['Landing page']);
  });
  it('recorrente sem periodicidade é recusado pelo banco', async () => {
    await expect(createCatalogItem(a, { name: 'X', kind: 'recorrente', amount_cents: 100, cycle: null, description: null })).rejects.toThrow();
  });
});

describe('avisos da AbacatePay', () => {
  it('checkout avulso pago, repetido e reembolsado', async () => {
    const service = await serviceWith(a);
    await insertCharge(a, { service_id: service.id, description: 'Site', amount_cents: 2990, due_date: '2026-11-20', method: 'pix', status: 'pendente', abacate_checkout_id: 'bill_one' });
    const paid = evt('checkout.completed', { checkout: { id: 'bill_one', frequency: 'ONE_TIME', updatedAt: '2026-11-17T15:00:00Z' }, payerInformation: { method: 'CARD' } });
    expect(await applyAbacateEvent(a, paid)).toBe('pago');
    expect(await applyAbacateEvent(a, paid)).toBe('ignorado');
    const [charge] = await listCharges(a, [service.id]);
    expect(charge).toMatchObject({ status: 'pago', method: 'cartao' });
    expect(new Date(String(charge!.paid_at)).toISOString()).toBe('2026-11-17T15:00:00.000Z');
    expect(await applyAbacateEvent(a, evt('checkout.refunded', { checkout: { id: 'bill_one' } }))).toBe('cancelado');
  });

  it('aviso de um workspace não toca a cobrança de outro', async () => {
    const service = await serviceWith(a);
    await insertCharge(a, { service_id: service.id, description: 'Site', amount_cents: 2990, due_date: '2026-11-20', method: 'pix', status: 'pendente', abacate_checkout_id: 'bill_iso' });
    expect(await applyAbacateEvent(b, evt('checkout.completed', { checkout: { id: 'bill_iso', frequency: 'ONE_TIME' } }))).toBe('ignorado');
    expect((await listCharges(a, [service.id]))[0]!.status).toBe('pendente');
  });

  it('assinatura: primeiro pagamento, falha, renovação e cancelamento', async () => {
    const service = await serviceWith(a, 'recorrente');
    await a.from('services').update({ abacate_checkout_id: 'bill_sub' }).eq('id', service.id);
    await insertCharge(a, { service_id: service.id, description: 'Manutenção', amount_cents: 2990, due_date: '2026-11-17', method: 'cartao', status: 'pendente', payment_url: 'https://pay/bill_sub', abacate_checkout_id: 'bill_sub' });
    const sub = { id: 'subs_1', method: 'CARD', amount: 2990 };

    // Primeiro pagamento: a cobrança do link vira paga e o serviço ganha a assinatura.
    expect(await applyAbacateEvent(a, evt('subscription.completed', { checkout: subCheckout('bill_sub'), subscription: sub, payment: { id: 'card_1', amount: 2990 } }))).toBe('pago');
    expect((await getService(a, service.id))?.abacate_subscription_id).toBe('subs_1');
    expect((await listCharges(a, [service.id])).map((c) => c.status)).toEqual(['pago']);

    // O checkout.completed que chega junto não conta de novo.
    expect(await applyAbacateEvent(a, evt('checkout.completed', { checkout: subCheckout('bill_sub') }))).toBe('ignorado');

    // Falha no ciclo seguinte: entra uma cobrança vencida (só uma, mesmo com várias tentativas).
    const failed = evt('subscription.payment_failed', { checkout: subCheckout('bill_sub'), subscription: sub, payment: { id: 'card_f1', amount: 2990 }, installmentId: 'intl_2' });
    expect(await applyAbacateEvent(a, failed)).toBe('vencido');
    expect(await applyAbacateEvent(a, { ...failed, data: { ...failed.data, payment: { id: 'card_f2', amount: 2990 } } })).toBe('ignorado');
    expect((await listCharges(a, [service.id])).map((c) => c.status).sort()).toEqual(['pago', 'vencido']);

    // A retentativa passa: a vencida vira paga, sem criar outra.
    expect(await applyAbacateEvent(a, evt('subscription.renewed', { checkout: subCheckout('bill_sub'), subscription: sub, payment: { id: 'card_2', amount: 2990 } }))).toBe('pago');
    expect((await listCharges(a, [service.id])).map((c) => c.status)).toEqual(['pago', 'pago']);

    // Renovação normal: cobrança nova, paga. Repetida, ignorada.
    const renewed = evt('subscription.renewed', { checkout: subCheckout('bill_sub'), subscription: sub, payment: { id: 'card_3', amount: 2990 } });
    expect(await applyAbacateEvent(a, renewed)).toBe('pago');
    expect(await applyAbacateEvent(a, renewed)).toBe('ignorado');
    expect(await listCharges(a, [service.id])).toHaveLength(3);

    // Cancelada: o serviço perde a assinatura, mas continua ativo (quem decide é a pessoa).
    expect(await applyAbacateEvent(a, evt('subscription.cancelled', { checkout: subCheckout('bill_sub'), subscription: { id: 'subs_1' } }))).toBe('assinatura_cancelada');
    expect(await getService(a, service.id)).toMatchObject({ abacate_subscription_id: null, status: 'ativo' });
  });
});

describe('mark_overdue_charges', () => {
  it('vence só as pendentes da AbacatePay com vencimento passado', async () => {
    const service = await serviceWith(a);
    const base = { service_id: service.id, description: 'X', amount_cents: 100, method: 'pix' as const, status: 'pendente' as const };
    await insertCharge(a, { ...base, due_date: '2026-11-10', abacate_checkout_id: 'bill_old' });
    await insertCharge(a, { ...base, due_date: '2026-11-30', abacate_checkout_id: 'bill_future' });
    await insertCharge(a, { ...base, due_date: '2026-11-10', asaas_payment_id: 'pay_asaas_old' });
    await pg.query(`select mark_overdue_charges('2026-11-17')`);
    const byCheckout = Object.fromEntries((await listCharges(a, [service.id])).map((c) => [c.abacate_checkout_id ?? c.asaas_payment_id, c.status]));
    expect(byCheckout).toEqual({ bill_old: 'vencido', bill_future: 'pendente', pay_asaas_old: 'pendente' });
  });
});
