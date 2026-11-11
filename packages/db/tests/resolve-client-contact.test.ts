import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { clientByContact, createClient, getClient, OPTED_OUT_MESSAGE, resolveClientContact } from '../src/clients';
import { createContact, getContact } from '../src/contacts';
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

const newClient = (phone: string | null, extra = {}) => createClient(db, { legal_name: `Cliente ${++n}`, document: '52998224725', contact_name: 'Carla', phone, ...extra });

describe('resolveClientContact', () => {
  it('cria contato manual com celular canônico e liga ao cliente', async () => {
    const client = await newClient('(19) 98134-2207');
    const out = await resolveClientContact(db, client);
    if (!('contactId' in out)) throw new Error('esperava contato');
    const contact = await getContact(db, out.contactId);
    expect(contact).toMatchObject({ phone_e164: '5519981342207', origin: 'manual', status: 'fechado', name: 'Carla' });
    expect((await getClient(db, client.id))?.contact_id).toBe(out.contactId);
  });
  it('reaproveita contato existente pelo celular', async () => {
    const existing = await createContact(db, { name: 'Já no CRM', phone_e164: '5511988887777', origin: 'manual', status: 'em_conversa' });
    const client = await newClient('11988887777');
    expect(await resolveClientContact(db, client)).toEqual({ contactId: existing.id });
    expect((await getClient(db, client.id))?.contact_id).toBe(existing.id);
  });
  it('bloqueia contato nao_contatar, ligado ou achado pelo celular', async () => {
    const blocked = await createContact(db, { name: 'Parou', phone_e164: '5511977776666', origin: 'manual', status: 'nao_contatar' });
    const byPhone = await newClient('11977776666');
    expect(await resolveClientContact(db, byPhone)).toEqual({ blocked: OPTED_OUT_MESSAGE });
    expect((await getClient(db, byPhone.id))?.contact_id).toBeNull();
    const linked = await newClient('11977776666', { contact_id: blocked.id });
    expect(await resolveClientContact(db, linked)).toEqual({ blocked: OPTED_OUT_MESSAGE });
  });
  it('bloqueia celular na lista do_not_contact sem criar nada', async () => {
    await pg.query(`insert into do_not_contact (phone_e164, reason) values ('5521955554444', 'teste')`);
    const client = await newClient('21955554444');
    expect(await resolveClientContact(db, client)).toEqual({ blocked: OPTED_OUT_MESSAGE });
    const { rows } = await pg.query(`select 1 from contacts where phone_e164 = '5521955554444'`);
    expect(rows).toHaveLength(0);
  });
  it('não religa contato que já é de outro cliente', async () => {
    const contact = await createContact(db, { name: 'Dono', phone_e164: '5531944443333', origin: 'manual', status: 'novo' });
    const owner = await newClient('31944443333', { contact_id: contact.id });
    const other = await newClient('31944443333');
    expect(await resolveClientContact(db, other)).toEqual({ contactId: contact.id });
    expect((await getClient(db, other.id))?.contact_id).toBeNull();
    expect((await clientByContact(db, contact.id))?.id).toBe(owner.id);
  });
  it('sem celular válido, avisa', async () => {
    expect(await resolveClientContact(db, await newClient(null))).toHaveProperty('blocked');
  });
});
