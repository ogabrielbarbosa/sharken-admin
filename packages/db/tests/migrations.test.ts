import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let db: PGlite;
// A conversão da v1 usa etapas que a 0008 já não aceita; esse teste roda no banco até a 0005.
let v1: PGlite;

/** Banco novo com as migrações aplicadas em ordem; `through` limita até o prefixo dado (ex.: '0005'). */
async function migrated(through?: string): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) {
    if (through && file.slice(0, 4) > through) break;
    await pg.exec(readFileSync(join(dir, file), 'utf8'));
  }
  if (!through) await pg.exec(TEST_WORKSPACE_DEFAULTS);
  return pg;
}

beforeAll(async () => {
  db = await migrated();
  v1 = await migrated('0005');
});

describe('migrações', () => {
  it('cria todas as tabelas com RLS ativo', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' order by relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([
      'batches', 'charges', 'clients', 'contacts', 'contracts', 'do_not_contact', 'events',
      'jobs', 'lead_assets', 'leads', 'messages', 'platform_admins', 'service_catalog', 'services', 'sites', 'videos', 'whatsapp_connection',
      'workspace_billing', 'workspace_invites', 'workspace_members', 'workspaces',
    ]);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('cria política restritiva contra escrita por OAuth em toda tabela que authenticated grava', async () => {
    const { rows } = await db.query<{ tablename: string }>(`
      select distinct tablename from pg_policies
      where schemaname = 'public' and 'authenticated' = any(roles) and cmd <> 'SELECT' and permissive = 'PERMISSIVE'
      except
      select tablename from pg_policies
      where policyname like tablename || '_no_oauth_write%' and permissive = 'RESTRICTIVE'`);
    expect(rows).toEqual([]);
  });

  it('a política de OAuth cobre só insert, update e delete', async () => {
    const { rows } = await db.query<{ cmd: string }>(
      `select distinct cmd from pg_policies where policyname like '%\\_no\\_oauth\\_write%'`,
    );
    expect(rows.map((r) => r.cmd).sort()).toEqual(['DELETE', 'INSERT', 'UPDATE']);
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
    await v1.query(`insert into leads (place_id, name, phone_e164, stage, contacted_at) values
      ('v1a', 'Aguardando', '5511900000001', 'aguardando', now()),
      ('v1b', 'Conversa', '5511900000002', 'conversa', now())`);
    await v1.query(`select migrate_v1_leads_to_contacts()`);
    const { rows } = await v1.query<{ phone_e164: string; status: string; origin: string }>(
      `select phone_e164, status, origin from contacts where phone_e164 in ('5511900000001','5511900000002') order by phone_e164`,
    );
    expect(rows).toEqual([
      { phone_e164: '5511900000001', status: 'contatado', origin: 'batch' },
      { phone_e164: '5511900000002', status: 'em_conversa', origin: 'batch' },
    ]);
    const leads = await v1.query<{ stage: string }>(`select stage from leads where place_id in ('v1a','v1b')`);
    expect(leads.rows.map((r) => r.stage)).toEqual(['crm', 'crm']);
  });

  it('recusa status de contato desconhecido', async () => {
    await expect(
      db.query(`insert into contacts (name, phone_e164, origin, status) values ('x', '5511900000009', 'manual', 'invalido')`),
    ).rejects.toThrow(/contacts_status_check/);
  });

  it('descarta leads da v1 sem contato e copia os campos dos demais', async () => {
    const batch = await v1.query<{ id: string }>(
      `insert into batches (location, location_key, business_type, quantity, criteria) values ('x', 'x', 'x', 1, '{}') returning id`,
    );
    const batchId = batch.rows[0]!.id;
    await v1.query(
      `insert into leads (place_id, name, phone_e164, stage, batch_id, contacted_at, follow_up_at, responded_at) values
        ('d1', 'Repetido A', '5511900000010', 'aguardando', $1, '2026-01-01T10:00:00Z', '2026-01-03T10:00:00Z', '2026-01-02T10:00:00Z'),
        ('d2', 'Repetido B', '5511900000010', 'aguardando', null, null, null, null),
        ('d3', 'Sem telefone', null, 'conversa', null, null, null, null),
        ('d4', 'Follow-up', '5511900000011', 'follow_up_feito', null, null, null, null),
        ('d5', 'Vendido', '5511900000012', 'vendido', null, null, null, null)`,
      [batchId],
    );
    await v1.query(`select migrate_v1_leads_to_contacts()`);

    const leads = await v1.query<{ place_id: string; stage: string; exit_reason: string | null }>(
      `select place_id, stage, exit_reason from leads where place_id in ('d1','d2','d3','d4','d5') order by place_id`,
    );
    expect(leads.rows).toEqual([
      { place_id: 'd1', stage: 'crm', exit_reason: null },
      { place_id: 'd2', stage: 'descartado', exit_reason: 'migração v2: telefone repetido' },
      { place_id: 'd3', stage: 'descartado', exit_reason: 'migração v2: sem telefone' },
      { place_id: 'd4', stage: 'crm', exit_reason: null },
      { place_id: 'd5', stage: 'vendido', exit_reason: null },
    ]);

    const shared = await v1.query(`select 1 from contacts where phone_e164 = '5511900000010'`);
    expect(shared.rows).toHaveLength(1);

    const contacts = await v1.query<{ phone_e164: string; status: string; follow_ups_without_reply: number }>(
      `select phone_e164, status, follow_ups_without_reply from contacts
       where phone_e164 in ('5511900000011','5511900000012') order by phone_e164`,
    );
    expect(contacts.rows).toEqual([
      { phone_e164: '5511900000011', status: 'follow_up', follow_ups_without_reply: 1 },
      { phone_e164: '5511900000012', status: 'fechado', follow_ups_without_reply: 0 },
    ]);

    const copied = await v1.query<Record<string, string | null>>(
      `select batch_id, first_contact_at::text, follow_up_at::text, responded_at::text, name, lead_id
       from contacts where phone_e164 = '5511900000010'`,
    );
    const lead = await v1.query<{ id: string }>(`select id from leads where place_id = 'd1'`);
    expect(copied.rows[0]).toEqual({
      batch_id: batchId,
      first_contact_at: '2026-01-01 10:00:00+00',
      follow_up_at: '2026-01-03 10:00:00+00',
      responded_at: '2026-01-02 10:00:00+00',
      name: 'Repetido A',
      lead_id: lead.rows[0]!.id,
    });
  });

  it('aceita pagina e video e recusa as etapas removidas', async () => {
    await db.query(`insert into leads (place_id, name, stage) values ('s1', 'x', 'pagina'), ('s2', 'x', 'video')`);
    for (const stage of ['gerando_material', 'revisar_material', 'abordar', 'aguardando', 'follow_up_feito', 'conversa']) {
      await expect(db.query(`insert into leads (place_id, name, stage) values ('bad-${stage}', 'x', '${stage}')`)).rejects.toThrow(/leads_stage_check/);
    }
  });

  it('stage_changed_at muda com a etapa e não com o comentário', async () => {
    const { rows } = await db.query<{ id: string }>(`insert into leads (place_id, name, stage) values ('sc', 'x', 'revisar') returning id`);
    const id = rows[0]!.id;
    const read = async () => (await db.query<{ t: string }>(`select stage_changed_at::text as t from leads where id = $1`, [id])).rows[0]!.t;
    const born = await read();
    await db.query(`select pg_sleep(0.05)`);
    await db.query(`update leads set comment = 'oi' where id = $1`, [id]);
    expect(await read()).toBe(born);
    const before = (await db.query<{ t: string }>(`select clock_timestamp()::text as t`)).rows[0]!.t;
    await db.query(`update leads set stage = 'completar' where id = $1`, [id]);
    const after = (await db.query<{ t: string }>(`select clock_timestamp()::text as t`)).rows[0]!.t;
    const changed = await read();
    expect(changed > born).toBe(true);
    expect(changed >= before.slice(0, 19)).toBe(true);
    expect(changed <= after).toBe(true);
  });

  it('converte leads em material para pagina e cancela a geração automática pendente', async () => {
    const old = await migrated('0007');
    await old.query(`insert into leads (place_id, name, stage) values ('m1', 'x', 'gerando_material'), ('m2', 'x', 'revisar_material'), ('m3', 'x', 'crm')`);
    await old.query(`insert into leads (place_id, name, stage, updated_at) values ('m4', 'x', 'revisar', '2026-01-01T00:00:00Z')`);
    await old.query(`insert into jobs (type, payload, dedupe_key) values
      ('build_page', '{}', 'k1'), ('generate_page', '{}', 'k2'), ('render_video', '{}', 'k3'), ('transcode_video', '{}', 'k4'), ('analyze_lead', '{}', 'k5')`);
    await old.query(`insert into jobs (type, payload, dedupe_key, status) values ('build_page', '{}', 'k6', 'concluido')`);
    await old.exec(readFileSync(join(dir, '0008_pipeline.sql'), 'utf8'));

    const leads = await old.query<{ place_id: string; stage: string }>(`select place_id, stage from leads order by place_id`);
    expect(leads.rows).toEqual([
      { place_id: 'm1', stage: 'pagina' },
      { place_id: 'm2', stage: 'pagina' },
      { place_id: 'm3', stage: 'crm' },
      { place_id: 'm4', stage: 'revisar' },
    ]);
    const kept = await old.query<{ updated_at: string; stage_changed_at: string }>(
      `select updated_at::text, stage_changed_at::text from leads where place_id = 'm4'`,
    );
    expect(kept.rows[0]).toEqual({ updated_at: '2026-01-01 00:00:00+00', stage_changed_at: '2026-01-01 00:00:00+00' });
    const jobs = await old.query<{ dedupe_key: string; status: string; error: string | null }>(`select dedupe_key, status, error from jobs order by dedupe_key`);
    const cancelled = { status: 'erro', error: 'Cancelado: geração automática removida' };
    expect(jobs.rows).toEqual([
      { dedupe_key: 'k1', ...cancelled },
      { dedupe_key: 'k2', ...cancelled },
      { dedupe_key: 'k3', ...cancelled },
      { dedupe_key: 'k4', ...cancelled },
      { dedupe_key: 'k5', status: 'pendente', error: null },
      { dedupe_key: 'k6', status: 'concluido', error: null },
    ]);
  });
});
