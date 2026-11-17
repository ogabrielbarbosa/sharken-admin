import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Lead } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/client';
import { addContactToLead, createContactFromLead, linkContactToLead, setContactStatus } from '../src/contacts';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

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
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
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

describe('vários contatos por lead', () => {
  it('adiciona outro número ao mesmo lead, como contato manual do batch dele', async () => {
    const lead = await insertLead('Dr. Rafa', '5511911112222');
    const first = await createContactFromLead(fakeDb(pg), lead);
    const second = await addContactToLead(fakeDb(pg), lead.id, { name: 'Recepção Dr. Rafa', phone_e164: '5511933334444' });
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ lead_id: lead.id, batch_id: lead.batch_id, origin: 'manual', status: 'novo' });
    const { rows } = await pg.query(`select id from contacts where lead_id = $1`, [lead.id]);
    expect(rows).toHaveLength(2);
  });

  it('liga um contato sem lead pelo número e é idempotente', async () => {
    const lead = await insertLead('Clínica X', '5511955556666');
    const { rows } = await pg.query<{ id: string }>(`insert into contacts (name, phone_e164, origin) values ('Sócio', '5511977778888', 'whatsapp_direto') returning id`);
    const linked = await addContactToLead(fakeDb(pg), lead.id, { name: 'ignorado', phone_e164: '5511977778888' });
    expect(linked.id).toBe(rows[0].id);
    const again = await addContactToLead(fakeDb(pg), lead.id, { name: 'ignorado', phone_e164: '5511977778888' });
    expect(again.id).toBe(rows[0].id);
    const { rows: c } = await pg.query<{ lead_id: string; batch_id: string }>(`select lead_id, batch_id from contacts where id = $1`, [rows[0].id]);
    expect(c[0]).toEqual({ lead_id: lead.id, batch_id: lead.batch_id });
  });

  it('recusa número que já é de outro lead', async () => {
    const a = await insertLead('Ótica A', '5511900001111');
    const b = await insertLead('Ótica B', '5511900002222');
    await createContactFromLead(fakeDb(pg), a);
    await expect(addContactToLead(fakeDb(pg), b.id, { name: 'x', phone_e164: '5511900001111' })).rejects.toThrow('outro lead');
  });

  it('desliga e liga de novo, registrando os eventos', async () => {
    const a = await insertLead('Pet A', '5511900003333');
    const b = await insertLead('Pet B', '5511900004444');
    const contact = await createContactFromLead(fakeDb(pg), a);
    await expect(linkContactToLead(fakeDb(pg), contact.id, b.id)).rejects.toThrow('outro lead');
    await linkContactToLead(fakeDb(pg), contact.id, null);
    await linkContactToLead(fakeDb(pg), contact.id, b.id);
    const { rows } = await pg.query<{ lead_id: string }>(`select lead_id from contacts where id = $1`, [contact.id]);
    expect(rows[0].lead_id).toBe(b.id);
    const { rows: ev } = await pg.query(`select 1 from events where lead_id = $1 and type = 'contato_desligado'`, [a.id]);
    expect(ev).toHaveLength(1);
  });

  it('um número perdido só tira o lead quando nenhum outro segue ativo', async () => {
    const lead = await insertLead('Estética Y', '5511900005555');
    await pg.query(`update leads set stage = 'crm' where id = $1`, [lead.id]);
    const a = await createContactFromLead(fakeDb(pg), { ...lead, stage: 'crm' });
    const b = await addContactToLead(fakeDb(pg), lead.id, { name: 'Recepção', phone_e164: '5511900006666' });
    const stage = async () => (await pg.query<{ stage: string }>(`select stage from leads where id = $1`, [lead.id])).rows[0].stage;
    await setContactStatus(fakeDb(pg), a, 'perdido');
    expect(await stage()).toBe('crm');
    await setContactStatus(fakeDb(pg), b, 'perdido');
    expect(await stage()).toBe('sem_interesse');
  });
});
