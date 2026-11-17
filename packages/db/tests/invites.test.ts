import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { acceptInvites, pendingInvites } from '../src/invites';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
let ws: string;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  db = fakeDb(pg);
  ws = ((await pg.query(`insert into workspaces (name, slug) values ('João', 'joao') returning id`)).rows[0] as { id: string }).id;
});

describe('convites', () => {
  it('quem cria a conta com o e-mail convidado entra direto no workspace, uma vez só', async () => {
    await pg.query(`insert into workspace_invites (workspace_id, email, role) values ($1, 'joao@x.com', 'owner')`, [ws]);
    expect(await pendingInvites(db, { email: 'JOAO@x.com' })).toHaveLength(1);

    const user = { id: '00000000-0000-0000-0000-000000000001', email: 'joao@x.com' };
    expect(await acceptInvites(db, user)).toBe(1);
    expect(await acceptInvites(db, user)).toBe(0);
    expect(await pendingInvites(db, { workspaceId: ws })).toHaveLength(0);

    const { rows } = await pg.query(`select role from workspace_members where workspace_id = $1 and user_id = $2`, [ws, user.id]);
    expect(rows).toEqual([{ role: 'owner' }]);
  });

  it('e-mail sem convite não ganha workspace', async () => {
    expect(await acceptInvites(db, { id: '00000000-0000-0000-0000-000000000002', email: 'outro@x.com' })).toBe(0);
  });

  it('recusa e-mail com maiúscula gravado direto no banco', async () => {
    await expect(pg.query(`insert into workspace_invites (workspace_id, email) values ($1, 'A@x.com')`, [ws])).rejects.toThrow();
  });
});
