import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { instagramHandle, siteDomain } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { importLeads } from '../src/leads';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';
import type { NewLead } from '@lps/domain';

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
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
});

const urls = [
  'https://www.instagram.com/Clinica.Sorriso/?hl=pt', 'instagram.com/@dra_ana', 'http://instagram.com/odonto.sjc/reels/',
  'https://www.instagram.com/p/C1abc/', 'https://www.instagram.com/explore/tags/x/', 'https://www.Clinica.com.br/contato',
  'clinica.com.br', 'http://odonto.sjc.br:8080/?x=1', 'https://clinica.wixsite.com/site', 'https://linktr.ee/clinica',
  'https://wa.me/5512999999999', 'https://sites.google.com/view/clinica', 'https://m.facebook.com/x', 'localhost', '  ', '',
];

describe('chaves do lead no banco', () => {
  it('o banco calcula as mesmas chaves que o código', async () => {
    for (const url of urls) {
      const { rows } = await pg.query<{ h: string | null; d: string | null }>(
        'select lead_instagram_handle($1) as h, lead_site_domain($1) as d', [url]);
      expect({ url, ...rows[0] }).toEqual({ url, h: instagramHandle(url), d: siteDomain(url) });
    }
  });

  it('preenche as chaves ao gravar e ao trocar o link', async () => {
    const { rows } = await pg.query<{ id: string; instagram_handle: string; site_domain: string }>(
      `insert into leads (place_id, name, instagram_url, website_url)
       values ('k1', 'Clínica', 'https://instagram.com/Clinica/', 'https://www.clinica.com.br') returning id, instagram_handle, site_domain`);
    expect(rows[0]).toMatchObject({ instagram_handle: 'clinica', site_domain: 'clinica.com.br' });
    const updated = await pg.query<{ instagram_handle: string | null; site_domain: string | null }>(
      `update leads set instagram_url = null, website_url = 'https://outra.com' where id = $1 returning instagram_handle, site_domain`, [rows[0].id]);
    expect(updated.rows[0]).toEqual({ instagram_handle: null, site_domain: 'outra.com' });
  });

  it('aceita lead sem place_id', async () => {
    await expect(pg.query(`insert into leads (name, instagram_url) values ('Só Instagram', 'https://instagram.com/so.insta')`)).resolves.toBeDefined();
  });
});

describe('lead em mais de um batch', () => {
  const lead = (batch_id: string, place_id: string): NewLead => ({
    batch_id, place_id, name: `Clínica ${place_id}`, business_type: 'Dentista', phone_raw: null, phone_e164: null,
    address: null, city: 'São José dos Campos', is_open: true, rating: 4.8, reviews_count: 10, images_count: 0,
    description: null, categories: [], photos: [], reviews: [], website_url: null,
  });

  it('liga o lead aos dois batches e marca o segundo como já conhecido', async () => {
    const ws = ((await pg.query(`select id from workspaces where slug = 'sharken'`)).rows[0] as { id: string }).id;
    const db = scopeDb(fakeDb(pg), ws);
    const [b1, b2] = (await pg.query<{ id: string }>(
      `insert into batches (location, location_key, business_type, quantity, criteria)
       values ('SJC', 'sjc', 'dentista', 10, '{}'), ('SJC', 'sjc', 'lentes', 10, '{}') returning id`)).rows.map((r) => r.id);
    await importLeads(db, [lead(b1, 'p1'), lead(b1, 'p2')]);
    await importLeads(db, [lead(b2, 'p1'), lead(b2, 'p3')]);
    await importLeads(db, [lead(b2, 'p1')]);
    const { rows } = await pg.query<{ batch: string; place_id: string; already_known: boolean }>(
      `select case bl.batch_id when $1 then 'b1' else 'b2' end as batch, l.place_id, bl.already_known
       from batch_leads bl join leads l on l.id = bl.lead_id where bl.batch_id in ($1, $2) order by 1, 2`, [b1, b2]);
    expect(rows).toEqual([
      { batch: 'b1', place_id: 'p1', already_known: false },
      { batch: 'b1', place_id: 'p2', already_known: false },
      { batch: 'b2', place_id: 'p1', already_known: true },
      { batch: 'b2', place_id: 'p3', already_known: false },
    ]);
    expect((await pg.query(`select 1 from leads where place_id = 'p1'`)).rows).toHaveLength(1);
  });
});
