import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/client';
import { READ_ONLY_ERROR, readOnlyDb } from '../src/read-only';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
});

describe('readOnlyDb', () => {
  it('lê normalmente', async () => {
    const ro = readOnlyDb(fakeDb(pg));
    const { data } = await ro.from('batches').select('*');
    expect(Array.isArray(data)).toBe(true);
  });

  it('lê por cima do scopeDb, mantendo o filtro de workspace', async () => {
    const ws = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
    const ro = readOnlyDb(scopeDb(fakeDb(pg), ws));
    const { data, error } = await ro.from('batches').select('*').eq('id', '00000000-0000-0000-0000-000000000000');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(['insert', 'update', 'upsert', 'delete'])('lança em %s', (op) => {
    const ro = readOnlyDb(fakeDb(pg));
    expect(() => (ro.from('leads') as any)[op]({})).toThrow(READ_ONLY_ERROR);
  });

  it('lança em rpc', () => {
    expect(() => readOnlyDb(fakeDb(pg)).rpc('crm_chat_counts' as never)).toThrow(READ_ONLY_ERROR);
  });

  it('storage só permite URL assinada e download', async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'u' }, error: null }));
    const createSignedUrls = vi.fn(async () => ({ data: [], error: null }));
    const download = vi.fn(async () => ({ data: null, error: null }));
    const upload = vi.fn();
    const remove = vi.fn();
    const base = { storage: { from: () => ({ createSignedUrl, createSignedUrls, download, upload, remove }) } } as unknown as Db;
    const bucket = readOnlyDb(base).storage.from('b');
    expect((await bucket.createSignedUrl('p', 3600)).data?.signedUrl).toBe('u');
    await bucket.createSignedUrls(['p'], 3600);
    await bucket.download('p');
    expect(createSignedUrl).toHaveBeenCalledWith('p', 3600);
    expect(() => (bucket as any).upload('p', 'x')).toThrow(READ_ONLY_ERROR);
    expect(() => (bucket as any).remove(['p'])).toThrow(READ_ONLY_ERROR);
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('readOnlyDb com o supabase-js de verdade', () => {
  const real = () => readOnlyDb(createClient('http://localhost:1', 'key') as unknown as Db) as any;

  it('from().select() continua devolvendo um builder', () => {
    const q = real().from('leads').select('*');
    expect(typeof q.eq).toBe('function');
    expect(typeof q.then).toBe('function');
  });

  it.each([
    ['schema().from().insert', (d: any) => d.schema('public').from('leads').insert({})],
    ['rest.from().insert', (d: any) => d.rest.from('leads').insert({})],
    ['rest.rpc', (d: any) => d.rest.rpc('x')],
    ['auth.admin', (d: any) => d.auth.admin.deleteUser('x')],
    ['functions', (d: any) => d.functions.invoke('x')],
    ['channel', (d: any) => d.channel('x')],
    ['storage.createBucket', (d: any) => d.storage.createBucket('x')],
    ['storage.deleteBucket', (d: any) => d.storage.deleteBucket('x')],
    ['storage.from().upload', (d: any) => d.storage.from('b').upload('p', 'x')],
  ])('lança em %s', (_n, fn) => {
    expect(() => fn(real())).toThrow(READ_ONLY_ERROR);
  });

  it('não quebra await nem inspeção', async () => {
    const d = real();
    expect(await Promise.resolve(d)).toBe(d);
    expect(() => String(d)).not.toThrow();
  });
});
