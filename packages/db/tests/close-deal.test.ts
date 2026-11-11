import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { CloseDealInput } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { closeDeal } from '../src/clients';
import { fakeDb } from './fake-db';

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
  db = fakeDb(pg);
});

async function seed(opts: { status?: string; stage?: string; withLead?: boolean } = {}) {
  n += 1;
  let leadId: string | null = null;
  if (opts.withLead !== false) {
    const { rows } = await pg.query<{ id: string }>(`insert into leads (place_id, name, stage) values ($1, $2, $3) returning id`, [`p${n}`, `Pet ${n}`, opts.stage ?? 'crm']);
    leadId = rows[0].id;
  }
  const { rows } = await pg.query<{ id: string }>(
    `insert into contacts (name, phone_e164, origin, status, lead_id, follow_up_at) values ($1, $2, 'manual', $3, $4, now()) returning id`,
    [`Contato ${n}`, `5519981${String(100000 + n)}`, opts.status ?? 'em_conversa', leadId],
  );
  return { contactId: rows[0].id, leadId };
}

const input = (contactId: string, over: Partial<CloseDealInput['service']> = {}): CloseDealInput => ({
  contact_id: contactId,
  client: { legal_name: 'Pet Shop Foco', document: '52998224725', contact_name: 'Carla', email: '', phone: '5519981342207', address: 'Rua A, 1', location: 'Campinas' },
  service: { name: 'Site para Pet Shop Foco', kind: 'unico', amount_cents: 120000, start_date: '2026-11-18', notes: '', ...over },
  payment: { method: 'pix', first_due_date: '2026-11-20', cycle: null },
});
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = (sql: string, params: unknown[] = []) => pg.query<Row>(sql, params);
const count = async (table: string) => Number((await pg.query<{ c: string }>(`select count(*) c from ${table}`)).rows[0].c);

describe('close_deal', () => {
  it('cria cliente, serviço e contrato, e fecha contato e lead', async () => {
    const { contactId, leadId } = await seed();
    const contractId = await closeDeal(db, input(contactId));

    const { rows: [contract] } = await q(`select * from contracts where id = $1`, [contractId]);
    expect(contract.status).toBe('rascunho');
    const { rows: [service] } = await q(`select * from services where id = $1`, [contract.service_id]);
    expect(service).toMatchObject({ name: 'Site para Pet Shop Foco', kind: 'unico', amount_cents: 120000, payment_method: 'pix', cycle: null });
    expect(String(service.first_due_date)).toContain('2026');
    const { rows: [client] } = await q(`select * from clients where id = $1`, [service.client_id]);
    expect(client).toMatchObject({ contact_id: contactId, lead_id: leadId, legal_name: 'Pet Shop Foco', document: '52998224725', email: null, phone: '5519981342207' });
    const { rows: [contact] } = await q(`select status, follow_up_at from contacts where id = $1`, [contactId]);
    expect(contact).toMatchObject({ status: 'fechado', follow_up_at: null });
    const { rows: [lead] } = await q(`select stage, sold_at from leads where id = $1`, [leadId]);
    expect(lead.stage).toBe('vendido');
    expect(lead.sold_at).not.toBeNull();
    const { rows: events } = await q(`select type from events where lead_id = $1 order by type`, [leadId]);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['contato_fechado', 'contrato_criado']));
  });

  it('com serviço inválido não deixa nada gravado', async () => {
    const { contactId, leadId } = await seed();
    const before = { clients: await count('clients'), services: await count('services'), contracts: await count('contracts'), events: await count('events') };
    await expect(closeDeal(db, input(contactId, { amount_cents: -100 }))).rejects.toThrow();
    expect({ clients: await count('clients'), services: await count('services'), contracts: await count('contracts'), events: await count('events') }).toEqual(before);
    expect((await q(`select status from contacts where id = $1`, [contactId])).rows[0].status).toBe('em_conversa');
    expect((await q(`select stage from leads where id = $1`, [leadId])).rows[0].stage).toBe('crm');
  });

  it('reaproveita e atualiza o cliente que já existe para o contato', async () => {
    const { contactId } = await seed();
    await closeDeal(db, input(contactId));
    const again = input(contactId, { name: 'Manutenção mensal', kind: 'recorrente' });
    again.client.legal_name = 'Pet Shop Foco Ltda';
    again.payment = { method: 'boleto', first_due_date: '2026-12-05', cycle: 'mensal' };
    await closeDeal(db, again);
    const { rows: clients } = await q(`select legal_name from clients where contact_id = $1`, [contactId]);
    expect(clients).toEqual([{ legal_name: 'Pet Shop Foco Ltda' }]);
    const { rows: services } = await q(`select s.cycle, s.payment_method from services s join clients c on c.id = s.client_id where c.contact_id = $1 order by s.created_at`, [contactId]);
    expect(services).toEqual([{ cycle: null, payment_method: 'pix' }, { cycle: 'mensal', payment_method: 'boleto' }]);
  });

  it('liga um cliente já criado a partir do lead ao contato', async () => {
    const { contactId, leadId } = await seed();
    const { rows: [old] } = await pg.query<{ id: string }>(`insert into clients (lead_id, legal_name, document) values ($1, 'Antigo', '1') returning id`, [leadId]);
    await closeDeal(db, input(contactId));
    const { rows } = await q(`select id, contact_id, legal_name from clients where lead_id = $1`, [leadId]);
    expect(rows).toEqual([{ id: old.id, contact_id: contactId, legal_name: 'Pet Shop Foco' }]);
  });

  it('funciona sem lead', async () => {
    const { contactId } = await seed({ withLead: false });
    await closeDeal(db, input(contactId));
    expect((await q(`select status from contacts where id = $1`, [contactId])).rows[0].status).toBe('fechado');
  });

  it('mesma request_id devolve o mesmo contrato sem criar outro', async () => {
    const { contactId } = await seed();
    const keyed = { ...input(contactId), request_id: `req-${n}` };
    const first = await closeDeal(db, keyed);
    const second = await closeDeal(db, keyed);
    expect(second).toBe(first);
    expect((await q(`select count(*) c from services s join clients c on c.id = s.client_id where c.contact_id = $1`, [contactId])).rows[0].c).toEqual(1);
    expect((await q(`select count(*) c from contracts where request_id = $1`, [keyed.request_id])).rows[0].c).toEqual(1);
  });

  it('guarda o documento só com números', async () => {
    const { contactId } = await seed();
    const row = { ...input(contactId) };
    row.client = { ...row.client, document: '529.982.247-25' };
    await closeDeal(db, row);
    expect((await q(`select document from clients where contact_id = $1`, [contactId])).rows[0].document).toBe('52998224725');
  });

  it('recusa contato Não contatar', async () => {
    const { contactId } = await seed({ status: 'nao_contatar' });
    const before = await count('clients');
    await expect(closeDeal(db, input(contactId))).rejects.toThrow(/não contatar/i);
    expect(await count('clients')).toBe(before);
  });

  it('não mexe no lead que não está no CRM', async () => {
    const { contactId, leadId } = await seed({ stage: 'sem_interesse' });
    await closeDeal(db, input(contactId));
    expect((await q(`select stage from leads where id = $1`, [leadId])).rows[0].stage).toBe('sem_interesse');
  });
});
