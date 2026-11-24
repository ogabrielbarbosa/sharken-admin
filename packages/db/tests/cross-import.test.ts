import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { NewLead } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { dismissDuplicate, listPossibleDuplicates, mergeLeads } from '../src/duplicates';
import { addManualLead, importLeads, listKnownLeads, listLeads } from '../src/leads';
import { createManualBatch, deleteBatch } from '../src/batches';
import { scopeDb } from '../src/scope';
import { findSearchTerm, saveSearchTerm } from '../src/search-terms';
import type { Db } from '../src/client';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: Db;
let other: Db;

const base = (batch_id: string, o: Partial<NewLead>): NewLead => ({
  batch_id, place_id: null, name: 'x', business_type: 'Dentista', phone_raw: null, phone_e164: null, address: null,
  city: 'São José dos Campos', is_open: true, rating: null, reviews_count: 0, images_count: 0, description: null,
  categories: [], photos: [], reviews: [], website_url: null, ...o,
});

async function batch(name: string): Promise<string> {
  return ((await pg.query<{ id: string }>(
    `insert into batches (location, location_key, business_type, quantity, criteria, source) values ('SJC', 'sjc', $1, 10, '{}', 'instagram') returning id`, [name])).rows[0]).id;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  const ws = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
  const ws2 = ((await pg.query(`insert into workspaces (name, slug) values ('Primo', 'primo') returning id`)).rows[0] as { id: string }).id;
  db = scopeDb(fakeDb(pg), ws);
  other = scopeDb(fakeDb(pg), ws2);
});

describe('Instagram primeiro, Maps em cima', () => {
  it('cruza pelo telefone e pelo domínio, completa e mantém a etapa', async () => {
    const insta = await batch('lentes');
    await importLeads(db, [
      base(insta, { name: 'Clínica Sorriso', instagram_url: 'https://www.instagram.com/clinica.sorriso/', phone_e164: '5512999990001', instagram_last_post_at: '2026-11-20T00:00:00Z' }),
      base(insta, { name: 'Dra. Ana Lentes', instagram_url: 'https://www.instagram.com/dra.ana/', website_url: 'https://draana.com.br' }),
    ]);
    const [sorriso] = (await listLeads(db, insta)).filter((l) => l.name === 'Clínica Sorriso');
    await pg.query(`update leads set stage = 'pagina' where id = $1`, [sorriso.id]);

    const maps = await batch('dentista');
    const result = await importLeads(db, [
      base(maps, { place_id: 'P1', name: 'Clínica Sorriso Odontologia', phone_e164: '5512999990001', address: 'Rua A, 1', rating: 4.9, reviews_count: 80 }),
      base(maps, { place_id: 'P2', name: 'Ana Odontologia', website_url: 'https://www.draana.com.br/', phone_e164: '5512999990002' }),
      base(maps, { place_id: 'P3', name: 'Dente de Ouro', phone_e164: '5512999990003' }),
    ]);
    expect(result).toEqual({ inserted: 1, updated: 2, known: 2, ids: expect.any(Array) });

    const inMaps = await listLeads(db, maps);
    expect(inMaps).toHaveLength(3);
    const again = inMaps.find((l) => l.id === sorriso.id)!;
    expect(again).toMatchObject({ stage: 'pagina', place_id: 'P1', address: 'Rua A, 1', name: 'Clínica Sorriso', batch_id: insta });
    expect(Number(again.rating)).toBe(4.9);
    const known = await listKnownLeads(db, maps);
    expect(Object.keys(known)).toHaveLength(2);
    expect(known[sorriso.id].map((b) => b.business_type)).toEqual(['lentes']);
    expect((await pg.query(`select 1 from leads where workspace_id = (select id from workspaces where slug = 'sharken')`)).rows).toHaveLength(3);
  });

  it('não cruza com outro workspace', async () => {
    const b = ((await pg.query<{ id: string }>(
      `insert into batches (location, location_key, business_type, quantity, criteria, workspace_id) values ('SJC', 'sjc', 'x', 10, '{}', (select id from workspaces where slug = 'primo')) returning id`)).rows[0]).id;
    expect(await importLeads(other, [base(b, { place_id: 'P1', name: 'Clínica Sorriso' })])).toMatchObject({ inserted: 1, updated: 0, known: 0 });
  });
});

describe('possíveis duplicados', () => {
  it('lista, junta e separa', async () => {
    const b = await batch('estetica');
    await importLeads(db, [
      base(b, { name: 'Studio Bella Pele', instagram_url: 'https://instagram.com/bellapele' }),
      base(b, { place_id: 'P9', name: 'Bella Pele Estética' }),
      base(b, { name: 'Bela Pelle', instagram_url: 'https://instagram.com/belapelle' }),
    ]);
    const pairs = await listPossibleDuplicates(db);
    const names = pairs.map((p) => [p.a.name, p.b.name].sort().join(' / '));
    expect(names).toContain('Bella Pele Estética / Studio Bella Pele');

    const pair = pairs.find((p) => [p.a.name, p.b.name].includes('Bella Pele Estética') && [p.a.name, p.b.name].includes('Studio Bella Pele'))!;
    const { kept, removed } = await mergeLeads(db, pair.a.id, pair.b.id);
    const { rows } = await pg.query<{ place_id: string; instagram_url: string }>(`select place_id, instagram_url from leads where id = $1`, [kept]);
    expect(rows[0]).toEqual({ place_id: 'P9', instagram_url: 'https://instagram.com/bellapele' });
    expect((await pg.query(`select 1 from leads where id = $1`, [removed])).rows).toHaveLength(0);
    expect((await listLeads(db, b)).map((l) => l.id)).toContain(kept);

    for (const p of await listPossibleDuplicates(db)) await dismissDuplicate(db, p.a.id, p.b.id);
    expect(await listPossibleDuplicates(db)).toEqual([]);
  });
});

describe('variações salvas', () => {
  it('acha pelo texto parecido e troca ao salvar de novo', async () => {
    await saveSearchTerm(db, 'nicho', 'Lente dental', ['lentes de contato dental', 'lentes dentais', 'facetas']);
    expect((await findSearchTerm(db, 'nicho', 'lentes dentais'))?.variants).toEqual(['lentes de contato dental', 'lentes dentais', 'facetas']);
    expect((await findSearchTerm(db, 'nicho', 'lente dentl'))?.label).toBe('lente dental');
    expect(await findSearchTerm(db, 'nicho', 'estacionamento')).toBeNull();
    expect(await findSearchTerm(db, 'local', 'lente dental')).toBeNull();
    await saveSearchTerm(db, 'nicho', 'lentes dentais', ['facetas', 'lentes dentais']);
    expect((await findSearchTerm(db, 'nicho', 'lente dental'))?.variants).toEqual(['facetas', 'lentes dentais']);
  });
});

describe('apagar batch com lead que está em outro', () => {
  it('o lead fica e passa a ter o outro batch como origem', async () => {
    const b1 = await batch('um');
    const b2 = await batch('dois');
    await importLeads(db, [base(b1, { place_id: 'D1', name: 'Compartilhado' }), base(b1, { place_id: 'D2', name: 'Só do um' })]);
    await importLeads(db, [base(b2, { place_id: 'D1', name: 'Compartilhado' })]);
    await deleteBatch(db, b1);
    const { rows } = await pg.query<{ place_id: string; batch_id: string }>(`select place_id, batch_id from leads where place_id in ('D1', 'D2')`);
    expect(rows).toEqual([{ place_id: 'D1', batch_id: b2 }]);
    expect((await listLeads(db, b2)).map((l) => l.place_id)).toEqual(['D1']);
  });
});

describe('batch manual', () => {
  it('cadastra, põe na fila e não repete um negócio conhecido', async () => {
    const b = await createManualBatch(db, 'Advocacia');
    expect(b).toMatchObject({ source: 'manual', location: 'Leads manuais' });
    const lead = base(b.id, { name: 'Silva Adv', instagram_url: 'https://www.instagram.com/silva.adv/' });
    expect(await addManualLead(db, { ...lead, batch_id: lead.batch_id! })).toEqual({ known: false });
    expect(await addManualLead(db, { ...lead, batch_id: lead.batch_id! })).toEqual({ known: true });
    const [saved, ...rest] = await listLeads(db, b.id);
    expect(rest).toHaveLength(0);
    expect((await pg.query(`select 1 from jobs where type = 'analyze_lead' and payload->>'lead_id' = $1`, [saved.id])).rows).toHaveLength(1);
    expect((await pg.query<{ status: string }>(`select status from batches where id = $1`, [b.id])).rows[0].status).toBe('analisando');
  });
});
