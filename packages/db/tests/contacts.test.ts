import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Lead } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/client';
import { createContactFromLead } from '../src/contacts';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;

/** Cliente mínimo com a mesma forma do supabase-js, executando em PGlite. */
function fakeDb(pg: PGlite): Db {
  const builder = (table: string) => {
    const s = { op: 'select', values: {} as Record<string, unknown>, filters: [] as [string, string, unknown][], single: false, limit: 0 };
    const run = async () => {
      const params: unknown[] = [];
      const p = (v: unknown) => (params.push(v), `$${params.length}`);
      const where = s.filters.length
        ? ' where ' + s.filters.map(([c, k, v]) => (k === 'in' ? `${c} = any(${p(v)})` : `${c} = ${p(v)}`)).join(' and ')
        : '';
      const enc = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
      const keys = Object.keys(s.values);
      let sql: string;
      if (s.op === 'insert') sql = `insert into ${table} (${keys.join(',')}) values (${keys.map((k) => p(enc(s.values[k]))).join(',')}) returning *`;
      else if (s.op === 'update') sql = `update ${table} set ${keys.map((k) => `${k} = ${p(enc(s.values[k]))}`).join(',')}${where} returning *`;
      else sql = `select * from ${table}${where}${s.limit ? ` limit ${s.limit}` : ''}`;
      try {
        const { rows } = await pg.query(sql, params);
        return { data: s.single ? (rows[0] ?? null) : rows, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Record<string, unknown>) => ((s.op = 'insert'), (s.values = v), b),
      update: (v: Record<string, unknown>) => ((s.op = 'update'), (s.values = v), b),
      eq: (c: string, v: unknown) => (s.filters.push([c, 'eq', v]), b),
      in: (c: string, v: unknown[]) => (s.filters.push([c, 'in', v]), b),
      limit: (n: number) => ((s.limit = n), b),
      single: () => ((s.single = true), b),
      maybeSingle: () => ((s.single = true), b),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  };
  return { from: builder } as unknown as Db;
}

async function insertLead(name: string, phone: string | null): Promise<Lead> {
  const batch = await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Rio', 'rio', 'padaria', 5, '{}') returning id`);
  const { rows } = await pg.query<Lead>(
    `insert into leads (place_id, name, phone_e164, stage, batch_id) values ($1, $2, $3, 'video', $4) returning *`,
    [`p-${name}`, name, phone, batch.rows[0].id],
  );
  return rows[0];
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
});

describe('createContactFromLead', () => {
  it('cria o contato com origem batch e status novo', async () => {
    const lead = await insertLead('Padaria Sol', '5521987654321');
    const contact = await createContactFromLead(fakeDb(pg), lead);
    expect(contact).toMatchObject({ name: 'Padaria Sol', phone_e164: '5521987654321', origin: 'batch', status: 'novo', lead_id: lead.id, batch_id: lead.batch_id });
  });

  it('liga o lead ao contato que já existe pelo número sem o nono dígito', async () => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into contacts (name, phone_e164, origin) values ('Contato antigo', '551187654321', 'whatsapp_direto') returning id`,
    );
    const lead = await insertLead('Café Lua', '5511987654321');
    const contact = await createContactFromLead(fakeDb(pg), lead);
    expect(contact.id).toBe(rows[0].id);
    expect(contact.lead_id).toBe(lead.id);
    const { rows: all } = await pg.query(`select id from contacts where phone_e164 like '5511%87654321'`);
    expect(all).toHaveLength(1);
  });

  it('mantém o vínculo existente quando o contato já tem outro lead', async () => {
    const first = await insertLead('Loja A', '5531988887777');
    const original = await createContactFromLead(fakeDb(pg), first);
    const second = await insertLead('Loja A filial', '5531988887777');
    const contact = await createContactFromLead(fakeDb(pg), second);
    expect(contact.id).toBe(original.id);
    expect(contact.lead_id).toBe(first.id);
    const { rows } = await pg.query(`select 1 from events where lead_id = $1 and type = 'contato_ligado'`, [second.id]);
    expect(rows).toHaveLength(1);
  });

  it('é idempotente para o mesmo lead', async () => {
    const lead = await insertLead('Barbearia Z', '5541999990000');
    const a = await createContactFromLead(fakeDb(pg), lead);
    const b = await createContactFromLead(fakeDb(pg), lead);
    expect(b.id).toBe(a.id);
  });

  it('recusa lead sem celular', async () => {
    const lead = await insertLead('Sem fone', null);
    await expect(createContactFromLead(fakeDb(pg), lead)).rejects.toThrow('Lead sem celular');
  });
});
