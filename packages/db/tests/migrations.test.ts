import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
});

describe('migrações', () => {
  it('cria todas as tabelas com RLS ativo', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' order by relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([
      'batches', 'charges', 'clients', 'contacts', 'contracts', 'do_not_contact', 'events',
      'jobs', 'lead_assets', 'leads', 'messages', 'services', 'sites', 'videos', 'whatsapp_connection',
    ]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('recusa etapa desconhecida', async () => {
    await expect(
      db.query(`insert into leads (place_id, name, stage) values ('a', 'x', 'etapa_errada')`),
    ).rejects.toThrow();
  });

  it('entrega cada tarefa uma única vez', async () => {
    await db.query(`insert into jobs (type, payload) values ('analyze_lead', '{}')`);
    const first = await db.query<{ id: string }>(`select * from claim_next_job()`);
    const second = await db.query<{ id: string }>(`select * from claim_next_job()`);
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
  });

  it('não entrega tarefa agendada para o futuro', async () => {
    await db.query(`insert into jobs (type, payload, run_after) values ('x', '{}', now() + interval '5 minutes')`);
    const { rows } = await db.query(`select * from claim_next_job()`);
    expect(rows).toHaveLength(0);
  });

  it('recusa telefone repetido em do_not_contact', async () => {
    await db.query(`insert into do_not_contact (phone_e164) values ('5511987654321')`);
    await expect(db.query(`insert into do_not_contact (phone_e164) values ('5511987654321')`)).rejects.toThrow();
  });

  it('converte leads da v1 em contatos', async () => {
    await db.query(`insert into leads (place_id, name, phone_e164, stage, contacted_at) values
      ('v1a', 'Aguardando', '5511900000001', 'aguardando', now()),
      ('v1b', 'Conversa', '5511900000002', 'conversa', now())`);
    await db.query(`select migrate_v1_leads_to_contacts()`);
    const { rows } = await db.query<{ phone_e164: string; status: string; origin: string }>(
      `select phone_e164, status, origin from contacts where phone_e164 in ('5511900000001','5511900000002') order by phone_e164`,
    );
    expect(rows).toEqual([
      { phone_e164: '5511900000001', status: 'contatado', origin: 'batch' },
      { phone_e164: '5511900000002', status: 'em_conversa', origin: 'batch' },
    ]);
    const leads = await db.query<{ stage: string }>(`select stage from leads where place_id in ('v1a','v1b')`);
    expect(leads.rows.map((r) => r.stage)).toEqual(['crm', 'crm']);
  });

  it('recusa status de contato desconhecido', async () => {
    await expect(
      db.query(`insert into contacts (name, phone_e164, origin, status) values ('x', '5511900000009', 'manual', 'invalido')`),
    ).rejects.toThrow(/contacts_status_check/);
  });

  it('descarta leads da v1 sem contato e copia os campos dos demais', async () => {
    const batch = await db.query<{ id: string }>(
      `insert into batches (location, location_key, business_type, quantity, criteria) values ('x', 'x', 'x', 1, '{}') returning id`,
    );
    const batchId = batch.rows[0]!.id;
    await db.query(
      `insert into leads (place_id, name, phone_e164, stage, batch_id, contacted_at, follow_up_at, responded_at) values
        ('d1', 'Repetido A', '5511900000010', 'aguardando', $1, '2026-01-01T10:00:00Z', '2026-01-03T10:00:00Z', '2026-01-02T10:00:00Z'),
        ('d2', 'Repetido B', '5511900000010', 'aguardando', null, null, null, null),
        ('d3', 'Sem telefone', null, 'conversa', null, null, null, null),
        ('d4', 'Follow-up', '5511900000011', 'follow_up_feito', null, null, null, null),
        ('d5', 'Vendido', '5511900000012', 'vendido', null, null, null, null)`,
      [batchId],
    );
    await db.query(`select migrate_v1_leads_to_contacts()`);

    const leads = await db.query<{ place_id: string; stage: string; exit_reason: string | null }>(
      `select place_id, stage, exit_reason from leads where place_id in ('d1','d2','d3','d4','d5') order by place_id`,
    );
    expect(leads.rows).toEqual([
      { place_id: 'd1', stage: 'crm', exit_reason: null },
      { place_id: 'd2', stage: 'descartado', exit_reason: 'migração v2: telefone repetido' },
      { place_id: 'd3', stage: 'descartado', exit_reason: 'migração v2: sem telefone' },
      { place_id: 'd4', stage: 'crm', exit_reason: null },
      { place_id: 'd5', stage: 'vendido', exit_reason: null },
    ]);

    const shared = await db.query(`select 1 from contacts where phone_e164 = '5511900000010'`);
    expect(shared.rows).toHaveLength(1);

    const contacts = await db.query<{ phone_e164: string; status: string; follow_ups_without_reply: number }>(
      `select phone_e164, status, follow_ups_without_reply from contacts
       where phone_e164 in ('5511900000011','5511900000012') order by phone_e164`,
    );
    expect(contacts.rows).toEqual([
      { phone_e164: '5511900000011', status: 'follow_up', follow_ups_without_reply: 1 },
      { phone_e164: '5511900000012', status: 'fechado', follow_ups_without_reply: 0 },
    ]);

    const copied = await db.query<Record<string, string | null>>(
      `select batch_id, first_contact_at::text, follow_up_at::text, responded_at::text, name, lead_id
       from contacts where phone_e164 = '5511900000010'`,
    );
    const lead = await db.query<{ id: string }>(`select id from leads where place_id = 'd1'`);
    expect(copied.rows[0]).toEqual({
      batch_id: batchId,
      first_contact_at: '2026-01-01 10:00:00+00',
      follow_up_at: '2026-01-03 10:00:00+00',
      responded_at: '2026-01-02 10:00:00+00',
      name: 'Repetido A',
      lead_id: lead.rows[0]!.id,
    });
  });
});
