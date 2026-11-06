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
      'batches', 'charges', 'clients', 'contracts', 'do_not_contact', 'events',
      'jobs', 'leads', 'services', 'sites', 'videos',
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
});
