import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteWorkspaceApify, getApifyToken, getWorkspaceApify, listApifyRuns, recordApifyRun, saveWorkspaceApify } from '../src/apify';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let raw: ReturnType<typeof fakeDb>;
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
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  raw = fakeDb(pg);
  wsA = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
  wsB = ((await pg.query(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`)).rows[0] as { id: string }).id;
});

describe('token do Apify por workspace', () => {
  it('sem token devolve null', async () => {
    expect(await getApifyToken(raw, wsA)).toBeNull();
    expect(await getWorkspaceApify(raw, wsA)).toBeNull();
  });

  it('cada workspace guarda o seu, e salvar de novo troca', async () => {
    await saveWorkspaceApify(raw, { workspace_id: wsA, token: 'apify_api_x', username: 'gabriel', plan: 'FREE' });
    expect(await getApifyToken(raw, wsA)).toBe('apify_api_x');
    expect(await getApifyToken(raw, wsB)).toBeNull();
    await saveWorkspaceApify(raw, { workspace_id: wsA, token: 'apify_api_y', username: 'gabriel', plan: 'STARTER' });
    expect(await getWorkspaceApify(raw, wsA)).toMatchObject({ token: 'apify_api_y', plan: 'STARTER' });
  });

  it('remover volta a null', async () => {
    await deleteWorkspaceApify(raw, wsA);
    expect(await getApifyToken(raw, wsA)).toBeNull();
  });
});

describe('execuções do Apify', () => {
  it('cada workspace lista só as suas, e registrar de novo não duplica', async () => {
    const run = { run_id: 'r1', workspace_id: wsA, actor: 'a/b', purpose: 'maps' as const };
    await recordApifyRun(raw, run);
    await recordApifyRun(raw, run);
    expect((await listApifyRuns(raw, wsA)).map((r) => [r.run_id, r.backfilled])).toEqual([['r1', false]]);
    expect(await listApifyRuns(raw, wsB)).toEqual([]);
  });
  it('falha ao registrar não lança', async () => {
    await expect(recordApifyRun(raw, { run_id: 'r2', workspace_id: '00000000-0000-0000-0000-000000000000', actor: 'a/b', purpose: 'maps' })).resolves.toBeUndefined();
  });
});
