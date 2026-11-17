import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { expiresAt, getPublicPage, listPages, newPageId, publishPage, setPageExpiration, PAGE_NOT_FOUND, LEAD_NOT_FOUND } from '../src/pages';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let wsA: string;
let wsB: string;
let n = 0;

const one = async <T>(sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows[0] as T;

async function lead(workspaceId: string, stage = 'pagina') {
  n += 1;
  return (await one<{ id: string }>(
    `insert into leads (place_id, name, stage, workspace_id) values ($1, $2, $3, $4) returning id`,
    [`pg-${n}`, `Lead ${n}`, stage, workspaceId],
  )).id;
}
const leadRow = (id: string) => one<{ stage: string; page_url: string | null }>(`select stage, page_url from leads where id = $1`, [id]);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  wsA = (await one<{ id: string }>(`select id from workspaces where slug = 'sharken'`)).id;
  wsB = (await one<{ id: string }>(`insert into workspaces (name, slug) values ('Primo', 'primo-pages') returning id`)).id;
}, 30000);

describe('newPageId', () => {
  it('gera 10 caracteres sem ambíguos e sem repetir', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newPageId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
  });
});

describe('expiresAt', () => {
  it('null não expira; horas somam a partir de agora', () => {
    expect(expiresAt(null)).toBeNull();
    expect(expiresAt(undefined)).toBeNull();
    expect(expiresAt(24, Date.UTC(2026, 10, 17, 22))).toBe('2026-11-18T22:00:00.000Z');
  });
});

describe('publishPage', () => {
  it('cria a página, grava o link no lead e passa Página para Vídeo', async () => {
    const id = await lead(wsA);
    const { page, url } = await publishPage(scopeDb(fakeDb(pg), wsA), { leadId: id, html: '<h1>Oi</h1>', title: 'Oi', expiresInHours: 24 });
    expect(url).toBe(`https://pages.sharkenapps.com/${page.id}`);
    expect(page.workspace_id).toBe(wsA);
    expect(page.expires_at).not.toBeNull();
    expect(await leadRow(id)).toEqual({ stage: 'video', page_url: url });
  });

  it('em outra etapa só grava o link', async () => {
    const id = await lead(wsA, 'crm');
    const { url } = await publishPage(scopeDb(fakeDb(pg), wsA), { leadId: id, html: '<p>x</p>' });
    expect(await leadRow(id)).toEqual({ stage: 'crm', page_url: url });
  });

  it('republica no mesmo id e mantém a expiração quando não é passada', async () => {
    const id = await lead(wsA);
    const db = scopeDb(fakeDb(pg), wsA);
    const first = await publishPage(db, { leadId: id, html: '<p>v1</p>', expiresInHours: 5 });
    const second = await publishPage(db, { leadId: id, html: '<p>v2</p>', pageId: first.page.id });
    expect(second.url).toBe(first.url);
    expect(second.page.expires_at).toEqual(first.page.expires_at);
    expect(await getPublicPage(fakeDb(pg), first.page.id)).toEqual({ html: '<p>v2</p>', expired: false });
  });

  it('não acha lead nem página de outro workspace', async () => {
    const other = await lead(wsB);
    await expect(publishPage(scopeDb(fakeDb(pg), wsA), { leadId: other, html: '<p>x</p>' })).rejects.toThrow(LEAD_NOT_FOUND);
    const mine = await lead(wsA);
    const theirs = await publishPage(scopeDb(fakeDb(pg), wsB), { leadId: other, html: '<p>b</p>' });
    await expect(publishPage(scopeDb(fakeDb(pg), wsA), { leadId: mine, html: '<p>a</p>', pageId: theirs.page.id })).rejects.toThrow(PAGE_NOT_FOUND);
    await expect(setPageExpiration(scopeDb(fakeDb(pg), wsA), theirs.page.id, 1)).rejects.toThrow(PAGE_NOT_FOUND);
  });

  it('recusa HTML vazio', async () => {
    await expect(publishPage(scopeDb(fakeDb(pg), wsA), { leadId: await lead(wsA), html: '  ' })).rejects.toThrow('vazio');
  });
});

describe('expiração', () => {
  it('página vencida volta como expirada; tirar a expiração reabre', async () => {
    const db = scopeDb(fakeDb(pg), wsA);
    const { page } = await publishPage(db, { leadId: await lead(wsA), html: '<p>x</p>' });
    expect(page.expires_at).toBeNull();
    await setPageExpiration(db, page.id, -1);
    expect(await getPublicPage(fakeDb(pg), page.id)).toEqual({ html: '', expired: true });
    await setPageExpiration(db, page.id, null);
    expect(await getPublicPage(fakeDb(pg), page.id)).toEqual({ html: '<p>x</p>', expired: false });
  });

  it('id inexistente ou inválido volta null', async () => {
    expect(await getPublicPage(fakeDb(pg), 'naoexiste1')).toBeNull();
    expect(await getPublicPage(fakeDb(pg), '../etc')).toBeNull();
  });
});

describe('listPages', () => {
  it('lista só as do workspace, filtrando por lead', async () => {
    const id = await lead(wsA);
    const db = scopeDb(fakeDb(pg), wsA);
    await publishPage(db, { leadId: id, html: '<p>1</p>' });
    const pages = await listPages(db, { leadId: id });
    expect(pages).toHaveLength(1);
    expect((await listPages(scopeDb(fakeDb(pg), wsB))).every((p) => p.workspace_id === wsB)).toBe(true);
  });
});
