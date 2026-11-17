import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { countChats, createContact, findContactByPhone, listChats } from '../src/contacts';
import { insertMessage } from '../src/messages';
import { scopeDb, workspaceOf } from '../src/scope';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let a: ReturnType<typeof fakeDb>;
let b: ReturnType<typeof fakeDb>;
let wsA: string;
let wsB: string;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  wsA = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
  wsB = ((await pg.query(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`)).rows[0] as { id: string }).id;
  a = scopeDb(fakeDb(pg), wsA);
  b = scopeDb(fakeDb(pg), wsB);
});

describe('workspaces', () => {
  it('guarda o workspace no cliente', () => {
    expect(workspaceOf(a)).toBe(wsA);
    expect(workspaceOf(fakeDb(pg))).toBeNull();
  });

  it('o mesmo número vira um contato em cada workspace, e cada um só vê o seu', async () => {
    const phone = '5521911112222';
    const ca = await createContact(a, { name: 'Loja A', phone_e164: phone, origin: 'manual', status: 'novo' });
    const cb = await createContact(b, { name: 'Loja B', phone_e164: phone, origin: 'manual', status: 'novo' });
    expect(ca.id).not.toBe(cb.id);
    expect((await findContactByPhone(a, phone))?.name).toBe('Loja A');
    expect((await findContactByPhone(b, phone))?.name).toBe('Loja B');
    expect((await listChats(b, { state: null })).map((c) => c.id)).toEqual([cb.id]);
  });

  it('mensagem gravada por função do banco herda o workspace do contato', async () => {
    const c = await createContact(b, { name: 'Só B', phone_e164: '5521933334444', origin: 'manual', status: 'novo' });
    await insertMessage(b, { contact_id: c.id, direction: 'entrada', body: 'oi', status: 'recebida', external_id: 'mesmo-id', at: new Date().toISOString() });
    const row = (await pg.query(`select workspace_id from messages where contact_id = $1`, [c.id])).rows[0] as { workspace_id: string };
    expect(row.workspace_id).toBe(wsB);
  });

  it('as contagens do CRM são por workspace', async () => {
    const before = await countChats(a);
    await createContact(b, { name: 'Outro', phone_e164: '5521955556666', origin: 'manual', status: 'novo' });
    expect(await countChats(a)).toEqual(before);
  });

  it('alterar pelo cliente de um workspace não mexe no outro', async () => {
    const c = await createContact(a, { name: 'Intocável', phone_e164: '5521977778888', origin: 'manual', status: 'novo' });
    await b.from('contacts').update({ name: 'Mexido' }).eq('id', c.id);
    expect((await findContactByPhone(a, '5521977778888'))?.name).toBe('Intocável');
  });
});
