import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { batchIdsOfLead, createLead, removeLeadFromBatch, saveLeadField, saveLeadNote, setLeadBatch } from '../src/lead-edit';
import { getLead, listEvents, updateLead } from '../src/leads';
import { scopeDb } from '../src/scope';
import type { Db } from '../src/client';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: Db;
let other: Db;

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


const by = '00000000-0000-0000-0000-000000000001';
const batch = async (name: string) => ((await pg.query<{ id: string }>(
  `insert into batches (location, location_key, business_type, quantity, criteria, source) values ('SJC', 'sjc', $1, 10, '{}', 'maps') returning id`, [name])).rows[0]).id;
const create = async (input: Parameters<typeof createLead>[1], batchId: string | null = null) => {
  const r = await createLead(db, input, { batchId, by });
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('lead cadastrado sem batch', () => {
  it('entra sem batch, em análise, com o nome provisório do link', async () => {
    const { id, known } = await create({ website_url: 'clinica-nova.com.br', instagram_url: '@clinica.nova' });
    expect(known).toBe(false);
    expect(await getLead(db, id)).toMatchObject({ batch_id: null, stage: 'analisando', name: 'clinica.nova', instagram_url: 'https://www.instagram.com/clinica.nova/' });
    expect(await batchIdsOfLead(db, id)).toEqual([]);
    const jobs = (await pg.query<{ type: string; payload: Record<string, string> }>(`select type, payload from jobs where payload->>'lead_id' = $1`, [id])).rows;
    // Só a análise: o Instagram não é lido no cadastro.
    expect(jobs).toEqual([{ type: 'analyze_lead', payload: { lead_id: id, manual: '1', provisional: '1' } }]);
  });
  it('não duplica quem já existe', async () => {
    const a = await create({ name: 'Repetido', website_url: 'repetido.com.br' });
    expect(await create({ name: 'Repetido 2', website_url: 'https://repetido.com.br/contato' })).toEqual({ id: a.id, known: true });
  });
  it('exige um nome ou um link, e batch do próprio workspace', async () => {
    expect(await createLead(db, {}, { batchId: null, by })).toHaveProperty('error');
    expect(await createLead(other, { name: 'X' }, { batchId: await batch('alheio'), by })).toEqual({ error: 'Batch não encontrado.' });
  });
});

describe('batch do lead', () => {
  it('muda, tira e mantém a etapa, com histórico', async () => {
    const [b1, b2] = [await batch('um'), await batch('dois')];
    const { id } = await create({ name: 'Movido', website_url: 'movido.com.br' });
    await updateLead(db, id, { stage: 'video' });
    expect(await setLeadBatch(db, id, b1, by)).toEqual({});
    expect(await setLeadBatch(db, id, b2, by)).toEqual({});
    expect(await batchIdsOfLead(db, id)).toEqual([b2]);
    expect(await getLead(db, id)).toMatchObject({ batch_id: b2, stage: 'video' });
    expect(await setLeadBatch(db, id, null, by)).toEqual({});
    expect(await batchIdsOfLead(db, id)).toEqual([]);
    expect(await getLead(db, id)).toMatchObject({ batch_id: null, stage: 'video' });
    const edits = (await listEvents(db, id)).filter((e) => e.type === 'dados_editados');
    expect(edits.map((e) => e.data)).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'batch', de: 'SJC · um', para: 'SJC · dois', por: by })]));
  });
  it('sair de um batch em que foi reencontrado não mexe no de origem', async () => {
    const [b1, b2] = [await batch('origem'), await batch('outro')];
    const { id } = await create({ name: 'Dois', website_url: 'dois.com.br' }, b1);
    await pg.query(`insert into batch_leads (batch_id, lead_id, workspace_id, already_known) select $1, id, workspace_id, true from leads where id = $2`, [b2, id]);
    await removeLeadFromBatch(db, id, b2, by);
    expect(await batchIdsOfLead(db, id)).toEqual([b1]);
    expect((await getLead(db, id))!.batch_id).toBe(b1);
  });
});

describe('edição', () => {
  it('grava, registra e só relê Google e site', async () => {
    const { id } = await create({ name: 'Editado' });
    await updateLead(db, id, { stage: 'revisar', site_status: 'funcionando', place_id: 'antigo' });
    expect(await saveLeadField(db, id, 'name', 'Novo nome', by)).toEqual({});
    expect(await saveLeadField(db, id, 'instagram_url', '@editado', by)).toEqual({});
    expect(await saveLeadField(db, id, 'maps_url', 'https://maps.app.goo.gl/abc', by)).toEqual({});
    expect(await saveLeadField(db, id, 'website_url', 'editado.com', by)).toEqual({});
    expect(await saveLeadField(db, id, 'email', 'ruim', by)).toHaveProperty('error');
    await saveLeadNote(db, id, 'comment', 'ligar amanhã', by);
    await saveLeadNote(db, id, 'comment', 'ligar amanhã ', by);
    expect(await getLead(db, id)).toMatchObject({ name: 'Novo nome', instagram_url: 'https://www.instagram.com/editado/', place_id: null, site_status: null, stage: 'revisar' });
    const jobs = (await pg.query<{ part: string }>(`select payload->>'part' as part from jobs where type = 'refresh_lead' and payload->>'lead_id' = $1 order by created_at`, [id])).rows;
    expect(jobs.map((j) => j.part)).toEqual(['maps', 'site']);
    expect((await listEvents(db, id)).filter((e) => e.type === 'dados_editados')).toHaveLength(5);
  });
  it('recusa Instagram de outro lead', async () => {
    await create({ name: 'Dono', instagram_url: '@dono.ig' });
    const { id } = await create({ name: 'Outro' });
    expect(await saveLeadField(db, id, 'instagram_url', 'https://instagram.com/Dono.ig?hl=pt', by)).toEqual({ error: 'Esse Instagram já é do lead Dono.' });
  });
});
