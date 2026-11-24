import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { DEFAULT_QUICK_REPLIES } from '../../config/src/quick-replies';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDefaultQuickReplies, createQuickReply, deleteQuickReply, listQuickReplies, reorderQuickReplies, updateQuickReply } from '../src/quick-replies';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let a: ReturnType<typeof fakeDb>;
let b: ReturnType<typeof fakeDb>;

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  const id = async (sql: string) => ((await pg.query(sql)).rows[0] as { id: string }).id;
  a = scopeDb(fakeDb(pg), await id(`select id from workspaces where slug = 'sharken'`));
  b = scopeDb(fakeDb(pg), await id(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`));
});

describe('mensagens rápidas', () => {
  it('workspace que já existia começa com as de antes; o novo recebe as padrão', async () => {
    const pick = (rows: { shortcut: string; title: string; body: string }[]) => rows.map(({ shortcut, title, body }) => ({ shortcut, title, body }));
    expect(pick(await listQuickReplies(a))).toEqual(DEFAULT_QUICK_REPLIES);
    expect(await listQuickReplies(b)).toEqual([]);
    expect(await addDefaultQuickReplies(b, DEFAULT_QUICK_REPLIES)).toBe(5);
    expect(pick(await listQuickReplies(b))).toEqual(DEFAULT_QUICK_REPLIES);
  });
  it('cria, desativa, reordena e exclui só no próprio workspace', async () => {
    await createQuickReply(a, { shortcut: 'preco', title: 'Preço', body: 'Texto' });
    const created = (await listQuickReplies(a)).at(-1)!;
    expect(created.shortcut).toBe('preco');
    await expect(updateQuickReply(b, created.id, { title: 'Invadido' })).rejects.toThrow('não existe mais');
    await deleteQuickReply(b, created.id);
    await updateQuickReply(a, created.id, { active: false, title: 'Novo' });
    expect((await listQuickReplies(a)).at(-1)).toMatchObject({ title: 'Novo', active: false });
    expect((await listQuickReplies(a, { onlyActive: true })).some((r) => r.id === created.id)).toBe(false);
    const ids = (await listQuickReplies(a)).map((r) => r.id).reverse();
    await reorderQuickReplies(a, ids);
    expect((await listQuickReplies(a)).map((r) => r.id)).toEqual(ids);
    await deleteQuickReply(a, created.id);
    expect(await listQuickReplies(a)).toHaveLength(5);
  });
  it('atalho repetido é recusado com aviso claro', async () => {
    await expect(createQuickReply(a, { shortcut: 'oi', title: 'X', body: 'Y' })).rejects.toThrow('Já existe uma mensagem com esse atalho.');
  });
  it('restaurar só acrescenta o que falta', async () => {
    const oi = (await listQuickReplies(a)).find((r) => r.shortcut === 'oi')!;
    await updateQuickReply(a, oi.id, { body: 'Meu texto' });
    await deleteQuickReply(a, (await listQuickReplies(a)).find((r) => r.shortcut === 'link')!.id);
    expect(await addDefaultQuickReplies(a, DEFAULT_QUICK_REPLIES)).toBe(1);
    expect((await listQuickReplies(a)).find((r) => r.shortcut === 'oi')!.body).toBe('Meu texto');
  });
});
