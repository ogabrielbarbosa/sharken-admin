import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, createService, getCharge, getService, insertCharge, listReadyToCharge, recordChargePaid, recordContractSigned, updateContract, updateService } from '../src/clients';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
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
  db = fakeDb(pg);
});

async function setup(name: string, opts: { contract?: 'rascunho' | 'enviado' | 'assinado'; leadId?: string } = {}) {
  const client = await createClient(db, { legal_name: name, document: '52998224725', lead_id: opts.leadId ?? null });
  const service = await createService(db, { client_id: client.id, name: `Site ${name}`, kind: 'unico', amount_cents: 150000, start_date: '2026-11-20' });
  const [contract] = await db.from('contracts').select().eq('service_id', service.id).then((r) => r.data as { id: string }[]);
  if (opts.contract && opts.contract !== 'rascunho') await updateContract(db, contract.id, { status: opts.contract });
  return { client, service, contract };
}
const charge = (serviceId: string, extra = {}): Promise<string> => {
  const id: string = crypto.randomUUID();
  return insertCharge(db, { id, service_id: serviceId, description: 'Site', amount_cents: 150000, due_date: '2026-11-20', method: 'pix', status: 'pendente', asaas_payment_id: `pay_${++n}`, ...extra }).then(() => id);
};

describe('listReadyToCharge', () => {
  it('traz só serviço com contrato assinado e sem cobrança', async () => {
    const ready = await setup('Pronto', { contract: 'assinado' });
    await setup('Sem contrato assinado', { contract: 'enviado' });
    await setup('Rascunho');
    const charged = await setup('Já cobrado', { contract: 'assinado' });
    await charge(charged.service.id);
    const subscribed = await setup('Assinatura', { contract: 'assinado' });
    await updateService(db, subscribed.service.id, { asaas_subscription_id: 'sub_1' });
    const cancelled = await setup('Cancelado', { contract: 'assinado' });
    await updateService(db, cancelled.service.id, { status: 'cancelado' });

    const rows = await listReadyToCharge(db);
    expect(rows.map((r) => r.client.legal_name)).toEqual(['Pronto']);
    expect(rows[0].service.id).toBe(ready.service.id);
  });
  it('serviço cujas cobranças foram todas canceladas volta a ficar pronto', async () => {
    const { service } = await setup('Cancelou', { contract: 'assinado' });
    await charge(service.id, { status: 'cancelado' });
    expect((await listReadyToCharge(db)).some((r) => r.service.id === service.id)).toBe(true);
    await charge(service.id);
    expect((await listReadyToCharge(db)).some((r) => r.service.id === service.id)).toBe(false);
  });
  it('serviço sem contrato assinado não aparece mesmo sem cobrança', async () => {
    const { service } = await setup('Só rascunho');
    expect((await listReadyToCharge(db)).some((r) => r.service.id === service.id)).toBe(false);
  });
});

const newLead = async (placeId: string) => (await pg.query<{ id: string }>(`insert into leads (place_id, name) values ($1, 'Lead') returning id`, [placeId])).rows[0].id;
const eventTypes = async (leadId: string) => (await pg.query<{ type: string }>('select type from events where lead_id = $1', [leadId])).rows.map((e) => e.type);

describe('recordChargePaid', () => {
  it('grava paid_at, reativa serviço concluído no primeiro pagamento e registra o evento no lead', async () => {
    const leadId = await newLead('p1');
    const { service } = await setup('Pago', { contract: 'assinado', leadId });
    await updateService(db, service.id, { status: 'concluido' });
    const id = await charge(service.id, { status: 'pago' });
    await recordChargePaid(db, id, '2026-11-06T12:00:00.000Z');
    expect(new Date((await getCharge(db, id))!.paid_at!).toISOString()).toBe('2026-11-06T12:00:00.000Z');
    expect((await getService(db, service.id))?.status).toBe('ativo');
    expect(await eventTypes(leadId)).toContain('pagamento_recebido');
  });
  it('sem lead, só grava paid_at e não falha; serviço cancelado continua cancelado', async () => {
    const { service } = await setup('Sem lead', { contract: 'assinado' });
    await updateService(db, service.id, { status: 'cancelado' });
    const id = await charge(service.id, { status: 'pago' });
    await recordChargePaid(db, id, '2026-11-07T12:00:00.000Z');
    expect((await getCharge(db, id))?.paid_at).not.toBeNull();
    expect((await getService(db, service.id))?.status).toBe('cancelado');
  });
});

describe('recordContractSigned', () => {
  it('registra "contrato_assinado" no lead do cliente, e nada sem lead', async () => {
    const leadId = await newLead('p2');
    const withLead = await setup('Assinou', { contract: 'assinado', leadId });
    await recordContractSigned(db, withLead.contract.id);
    expect(await eventTypes(leadId)).toEqual(['contrato_assinado']);
    const without = await setup('Assinou sem lead', { contract: 'assinado' });
    await expect(recordContractSigned(db, without.contract.id)).resolves.toBeUndefined();
  });
});
