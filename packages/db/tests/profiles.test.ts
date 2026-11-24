import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContact } from '../src/contacts';
import { insertMessage, listMessages } from '../src/messages';
import { listProfiles, profilesOrEmpty, saveProfile, uploadAvatar } from '../src/profiles';
import { scopeDb } from '../src/scope';
import { setConnection } from '../src/whatsapp-ingest';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const ana = '00000000-0000-4000-8000-00000000000a';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const now = new Date('2026-11-23T12:00:00Z');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
let uploads: string[] = [];

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  const storage = {
    from: () => ({
      upload: async (path: string) => (uploads.push(path), { error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://x/${path}` })), error: null }),
    }),
  };
  db = Object.assign(fakeDb(pg), { storage }) as ReturnType<typeof fakeDb>;
});

describe('perfil do usuário', () => {
  it('salvar só o nome preserva a foto', async () => {
    await saveProfile(db, ana, { name: 'Ana', avatarPath: 'a/1' });
    await saveProfile(db, ana, { name: 'Ana Lima' });
    expect((await listProfiles(db, [ana, ana])).get(ana)).toEqual({ userId: ana, name: 'Ana Lima', avatarUrl: 'https://x/a/1' });
    expect((await listProfiles(db, [])).size).toBe(0);
  });
  it('falha na leitura não derruba quem só quer mostrar a foto', async () => {
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'sem tabela' } }) }) }) } as unknown as typeof db;
    await expect(listProfiles(broken, [ana])).rejects.toThrow('sem tabela');
    expect((await profilesOrEmpty(broken, [ana])).size).toBe(0);
  });
  it('sobe só imagem de verdade e até 2 MB', async () => {
    const path = await uploadAvatar(db, ana, png);
    expect(path.startsWith(`${ana}/`)).toBe(true);
    expect(uploads).toEqual([path]);
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png);
    for (const bad of [new TextEncoder().encode('<svg/>'), big]) {
      await expect(uploadAvatar(db, ana, bad)).rejects.toThrow('Envie uma imagem JPG, PNG ou WebP de até 2 MB.');
    }
    expect(uploads).toHaveLength(1);
  });
  it('bucket das fotos é privado', async () => {
    expect((await pg.query(`select public from storage.buckets where id = 'avatars'`)).rows).toEqual([{ public: false }]);
  });
});

describe('conexão da mensagem', () => {
  it('copia a conexão do workspace na saída, e trocar o número não muda o histórico', async () => {
    const make = async (slug: string, phone: string) => {
      const { rows } = await pg.query<{ id: string }>(`insert into workspaces (name, slug) values ($1, $1) returning id`, [slug]);
      const scoped = scopeDb(db, rows[0]!.id);
      await setConnection(scoped, { state: 'conectado', phone, profileName: slug, statusReason: null } as Parameters<typeof setConnection>[1], now);
      return { scoped, contact: await createContact(scoped, { name: 'C', phone_e164: `5521${phone.slice(-9)}`, origin: 'manual', status: 'novo' }) };
    };
    const a = await make('ws-a', '5511911111111');
    const b = await make('ws-b', '5511922222222');
    await insertMessage(a.scoped, { contact_id: a.contact.id, direction: 'saida', sent_from: 'painel', body: '1' });
    await insertMessage(b.scoped, { contact_id: b.contact.id, direction: 'saida', sent_from: 'celular', body: '1' });
    await setConnection(a.scoped, { state: 'conectado', phone: '5511933333333', profileName: 'novo', statusReason: null } as Parameters<typeof setConnection>[1], now);
    await insertMessage(a.scoped, { contact_id: a.contact.id, direction: 'entrada', body: '2' });
    const out = await listMessages(a.scoped, a.contact.id);
    expect(out.find((m) => m.body === '1')).toMatchObject({ connection_phone: '5511911111111', connection_name: 'ws-a' });
    expect(out.find((m) => m.body === '2')).toMatchObject({ connection_phone: null, connection_name: null });
    expect((await listMessages(b.scoped, b.contact.id))[0]).toMatchObject({ connection_phone: '5511922222222', connection_name: 'ws-b' });
  });
});
