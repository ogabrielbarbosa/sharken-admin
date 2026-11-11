import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, createService, listContractsWithClient, updateContract } from '../src/clients';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let db: ReturnType<typeof fakeDb>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  db = fakeDb(pg);
  for (const [name, status] of [['Ana', 'rascunho'], ['Bia', 'enviado'], ['Caio', 'assinado'], ['Duda', 'enviado']] as const) {
    const client = await createClient(db, { legal_name: `Cliente ${name}`, document: '52998224725', contact_name: name });
    const service = await createService(db, { client_id: client.id, name: `Site ${name}`, kind: 'unico', amount_cents: 100000, start_date: '2026-11-20' });
    const [contract] = await db.from('contracts').select().eq('service_id', service.id).then((r) => r.data as { id: string }[]);
    if (status !== 'rascunho') await updateContract(db, contract.id, { status });
    ids[name] = contract.id;
  }
});

describe('listContractsWithClient', () => {
  it('traz contrato, serviço e cliente, do status mais recente para o mais antigo', async () => {
    const rows = await listContractsWithClient(db);
    expect(rows).toHaveLength(4);
    expect(rows[0].contract.id).toBe(ids.Duda);
    expect(rows[0].service.name).toBe('Site Duda');
    expect(rows[0].client.legal_name).toBe('Cliente Duda');
  });
  it('filtra por status', async () => {
    const rows = await listContractsWithClient(db, 'enviado');
    expect(rows.map((r) => r.client.contact_name).sort()).toEqual(['Bia', 'Duda']);
    expect(await listContractsWithClient(db, 'recusado')).toEqual([]);
  });
});
