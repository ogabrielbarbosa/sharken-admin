import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/client';
import {
  type Access,
  mcpGetBatch,
  mcpGetChat,
  mcpGetLead,
  mcpListBatches,
  mcpListChats,
  mcpListLeads,
  workspaceFilter,
} from '../src/mcp-read';
import { readOnlyDb } from '../src/read-only';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: Db;

type Ws = { id: string; batch: string; leads: Record<string, string>; contact: string; messages: string[] };
const ws: Record<'sharken' | 'primo', Ws> = {} as never;

let admin: Access;
let onlySharken: Access;
let onlyPrimo: Access;
const nobody: Access = { userId: 'u0', isAdmin: false, workspaces: [] };

const one = async <T>(sql: string, params: unknown[] = []) => (await pg.query(sql, params)).rows[0] as T;

async function seed(slug: 'sharken' | 'primo', workspaceId: string): Promise<Ws> {
  const batch = (await one<{ id: string }>(
    `insert into batches (location, location_key, business_type, quantity, criteria, status, workspace_id)
     values ($1, $1, 'Padaria', 10, '{}', 'concluido', $2) returning id`,
    [`Cidade ${slug}`, workspaceId],
  )).id;
  const leads: Record<string, string> = {};
  for (const stage of ['revisar', 'completar', 'crm', 'descartado']) {
    const media = stage === 'completar' ? JSON.stringify([{ kind: 'perfil', url: 'https://r2/x.jpg' }]) : '[]';
    leads[stage] = (await one<{ id: string }>(
      `insert into leads (batch_id, place_id, name, stage, score, instagram_media, workspace_id)
       values ($1, $2, $3, $4, 50, $5, $6) returning id`,
      [batch, `${slug}-${stage}`, `${slug} ${stage}`, stage, media, workspaceId],
    )).id;
  }
  await pg.query(
    `insert into lead_assets (lead_id, kind, body, status, workspace_id) values ($1, 'texto', 'pronto', 'pronto', $2), ($1, 'texto', 'extraindo', 'extraindo', $2)`,
    [leads.completar, workspaceId],
  );
  const contact = (await one<{ id: string }>(
    `insert into contacts (name, phone_e164, lead_id, origin, status, batch_id, workspace_id, last_message_at)
     values ($1, $2, $3, 'batch', 'contatado', $4, $5, now()) returning id`,
    [`Contato ${slug}`, slug === 'sharken' ? '5521900000001' : '5521900000002', leads.crm, batch, workspaceId],
  )).id;
  const messages: string[] = [];
  for (const [i, direction] of (['saida', 'entrada', 'nota'] as const).entries()) {
    messages.push((await one<{ id: string }>(
      `insert into messages (contact_id, direction, body, status, at, workspace_id)
       values ($1, $2, $3, 'enviada', now() - make_interval(mins => $4), $5) returning id`,
      [contact, direction, `${slug} msg ${i}`, 10 - i, workspaceId],
    )).id);
  }
  return { id: workspaceId, batch, leads, contact, messages };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  const wsA = (await one<{ id: string }>(`select id from workspaces where slug = 'sharken'`)).id;
  const wsB = (await one<{ id: string }>(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`)).id;
  ws.sharken = await seed('sharken', wsA);
  ws.primo = await seed('primo', wsB);
  const sharken = { id: wsA, name: 'Sharken', slug: 'sharken', role: 'owner' as const };
  const primo = { id: wsB, name: 'Primo', slug: 'primo', role: 'member' as const };
  admin = { userId: 'u1', isAdmin: true, workspaces: [sharken, primo] };
  onlySharken = { userId: 'u2', isAdmin: false, workspaces: [sharken] };
  onlyPrimo = { userId: 'u3', isAdmin: false, workspaces: [primo] };
  db = readOnlyDb(fakeDb(pg));
});

describe('workspaceFilter', () => {
  it('sem pedido devolve todos os acessíveis; por id ou slug, só o pedido', () => {
    expect(workspaceFilter(admin)).toEqual([ws.sharken.id, ws.primo.id]);
    expect(workspaceFilter(admin, 'primo')).toEqual([ws.primo.id]);
    expect(workspaceFilter(admin, ws.sharken.id)).toEqual([ws.sharken.id]);
  });

  it('pedido fora do acesso → []', () => {
    expect(workspaceFilter(onlySharken, 'primo')).toEqual([]);
    expect(workspaceFilter(onlySharken, ws.primo.id)).toEqual([]);
  });
});

describe('isolamento entre workspaces', () => {
  it('lead de outro workspace → null', async () => {
    expect(await mcpGetLead(db, onlyPrimo, ws.sharken.leads.crm)).toBeNull();
  });

  it('batch, conversa e listas não vazam', async () => {
    expect(await mcpGetBatch(db, onlyPrimo, ws.sharken.batch)).toBeNull();
    expect(await mcpGetChat(db, onlyPrimo, ws.sharken.contact)).toBeNull();
    const leads = await mcpListLeads(db, onlyPrimo, {});
    expect(leads.leads.every((l) => l.workspace === 'Primo')).toBe(true);
    expect(leads.leads.map((l) => l.id)).not.toContain(ws.sharken.leads.crm);
    expect((await mcpListLeads(db, onlyPrimo, { batchId: ws.sharken.batch })).leads).toEqual([]);
    const chats = await mcpListChats(db, onlyPrimo, {});
    expect(chats.chats.map((c) => c.id)).toEqual([ws.primo.contact]);
    expect((await mcpListBatches(db, onlyPrimo, {})).map((b) => b.id)).toEqual([ws.primo.batch]);
  });

  it('pedir um workspace sem acesso devolve vazio', async () => {
    expect(await mcpListBatches(db, onlySharken, { workspace: 'primo' })).toEqual([]);
    expect((await mcpListLeads(db, onlySharken, { workspace: 'primo' })).leads).toEqual([]);
    expect((await mcpListChats(db, onlySharken, { workspace: 'primo' })).chats).toEqual([]);
  });

  it('sem workspaces: listas vazias e null nos gets, sem lançar', async () => {
    expect(await mcpListBatches(db, nobody, {})).toEqual([]);
    expect(await mcpListLeads(db, nobody, {})).toEqual({ leads: [], next: null });
    expect(await mcpListChats(db, nobody, {})).toEqual({ chats: [], next: null });
    expect(await mcpGetBatch(db, nobody, ws.sharken.batch)).toBeNull();
    expect(await mcpGetLead(db, nobody, ws.sharken.leads.crm)).toBeNull();
    expect(await mcpGetChat(db, nobody, ws.sharken.contact)).toBeNull();
  });
});

describe('mcpListBatches', () => {
  it('admin sem workspace vê os dois, com o nome do workspace', async () => {
    const batches = await mcpListBatches(db, admin, {});
    expect(batches.map((b) => [b.id, b.workspace]).sort()).toEqual(
      [[ws.sharken.batch, 'Sharken'], [ws.primo.batch, 'Primo']].sort(),
    );
  });

  it('conta os leads por coluna', async () => {
    const [batch] = await mcpListBatches(db, onlySharken, {});
    expect(batch.columns).toEqual({ novo: 1, qualificado: 1, pagina: 0, video: 0, pronto: 1, descartados: 1 });
  });

  it('filtra por status', async () => {
    expect(await mcpListBatches(db, admin, { status: 'erro' })).toEqual([]);
  });
});

describe('mcpGetBatch', () => {
  it('agrupa os leads por coluna, com as vazias como []', async () => {
    const got = await mcpGetBatch(db, onlySharken, ws.sharken.batch);
    expect(got?.batch.workspace).toBe('Sharken');
    const ids = Object.fromEntries(Object.entries(got!.columns).map(([k, v]) => [k, v.map((l) => l.id)]));
    expect(ids).toEqual({
      novo: [ws.sharken.leads.revisar],
      qualificado: [ws.sharken.leads.completar],
      pagina: [],
      video: [],
      pronto: [ws.sharken.leads.crm],
      descartados: [ws.sharken.leads.descartado],
    });
    expect(got!.columns.pronto[0].contacts).toBe(1);
    expect(got!.columns.novo[0].contacts).toBe(0);
  });
});

describe('mcpListLeads', () => {
  it('coluna qualificado traz só completar, com has_instagram_media', async () => {
    const { leads } = await mcpListLeads(db, onlySharken, { column: 'qualificado' });
    expect(leads.map((l) => [l.id, l.stage, l.column, l.has_instagram_media])).toEqual([
      [ws.sharken.leads.completar, 'completar', 'qualificado', true],
    ]);
    const all = await mcpListLeads(db, onlySharken, {});
    expect(all.leads.filter((l) => l.has_instagram_media).map((l) => l.id)).toEqual([ws.sharken.leads.completar]);
  });

  it('pagina com cursor opaco', async () => {
    const first = await mcpListLeads(db, admin, { limit: 3 });
    expect(first.leads).toHaveLength(3);
    expect(first.next).toEqual(expect.any(String));
    const second = await mcpListLeads(db, admin, { limit: 3, cursor: first.next! });
    const third = await mcpListLeads(db, admin, { limit: 3, cursor: second.next! });
    expect(third.next).toBeNull();
    const ids = [...first.leads, ...second.leads, ...third.leads].map((l) => l.id);
    expect(new Set(ids).size).toBe(8);
  });

  it('busca pelo nome', async () => {
    const { leads } = await mcpListLeads(db, admin, { search: 'primo comp' });
    expect(leads.map((l) => l.id)).toEqual([ws.primo.leads.completar]);
  });
});

describe('mcpGetLead', () => {
  it('traz o lead, só os itens prontos e os contatos', async () => {
    const got = await mcpGetLead(db, onlySharken, ws.sharken.leads.completar);
    expect(got?.workspace).toBe('Sharken');
    expect(got?.lead.id).toBe(ws.sharken.leads.completar);
    expect(got?.assets.map((a) => a.status)).toEqual(['pronto']);
    expect(got?.contacts).toEqual([]);
    const crm = await mcpGetLead(db, onlySharken, ws.sharken.leads.crm);
    expect(crm?.contacts.map((c) => c.id)).toEqual([ws.sharken.contact]);
  });
});

describe('mcpListChats', () => {
  it('traz o workspace e o lead da conversa', async () => {
    const { chats } = await mcpListChats(db, admin, { workspace: 'sharken' });
    expect(chats.map((c) => [c.id, c.workspace, c.lead])).toEqual([
      [ws.sharken.contact, 'Sharken', { id: ws.sharken.leads.crm, name: 'sharken crm' }],
    ]);
    expect((await mcpListChats(db, admin, { status: 'fechado' })).chats).toEqual([]);
    expect((await mcpListChats(db, admin, { state: 'aberto', batchId: ws.primo.batch })).chats.map((c) => c.id)).toEqual([ws.primo.contact]);
  });
});

describe('mcpGetChat', () => {
  it('as N mais recentes em ordem cronológica, incluindo nota', async () => {
    const got = await mcpGetChat(db, onlyPrimo, ws.primo.contact, 2);
    expect(got?.workspace).toBe('Primo');
    expect(got?.messages.map((m) => m.id)).toEqual(ws.primo.messages.slice(1));
    expect(got?.messages.map((m) => m.direction)).toEqual(['entrada', 'nota']);
    expect(got?.lead?.id).toBe(ws.primo.leads.crm);
    expect(got?.lead?.contacts).toBe(1);
  });
});

describe('cursor', () => {
  it('cursor inválido lança', async () => {
    await expect(mcpListLeads(db, admin, { cursor: 'lixo' })).rejects.toThrow('Cursor inválido.');
  });
});

describe('listas de ids em pedaços', () => {
  it('nenhum `in` passa de 100 ids, para a URL da REST não estourar', async () => {
    const wsId = (await one<{ id: string }>(`insert into workspaces (name, slug) values ('Grande', 'grande') returning id`)).id;
    const batch = (await one<{ id: string }>(
      `insert into batches (location, location_key, business_type, quantity, criteria, status, workspace_id)
       values ('Cidade grande', 'cidade grande', 'Padaria', 150, '{}', 'concluido', $1) returning id`,
      [wsId],
    )).id;
    await pg.query(
      `insert into leads (batch_id, place_id, name, stage, score, workspace_id)
       select $1, 'grande-' || i, 'Lead ' || i, 'revisar', 50, $2 from generate_series(1, 150) i`,
      [batch, wsId],
    );
    const sizes: number[] = [];
    const base = fakeDb(pg);
    const spy = {
      ...base,
      from: (table: string) => {
        const q = base.from(table) as unknown as Record<string, (c: string, v: unknown[]) => unknown>;
        const inner = q.in;
        q.in = (c, v) => (sizes.push(v.length), inner(c, v));
        return q;
      },
    } as unknown as Db;
    const access: Access = { userId: 'u9', isAdmin: false, workspaces: [{ id: wsId, name: 'Grande', slug: 'grande', role: 'owner' }] };
    const got = await mcpListLeads(spy, access, { limit: 200 });
    expect(got.leads).toHaveLength(150);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  });
});
