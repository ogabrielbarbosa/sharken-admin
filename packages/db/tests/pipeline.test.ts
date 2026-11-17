import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { LeadStage } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { listLeads } from '../src/leads';
import { completeInfo, qualifyLeads, savePageUrl, saveLoomUrl, stepBack, STALE } from '../src/pipeline';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const LOOM = 'https://www.loom.com/share/abc123def456';
let pg: PGlite;
let n = 0;
let batchId: string;

const db = () => fakeDb(pg);

async function lead(stage: LeadStage, extra: { phone?: string | null; flow?: string; reason?: string } = {}) {
  n += 1;
  const phone = extra.phone === undefined ? `55219${String(10000000 + n)}` : extra.phone;
  const { rows } = await pg.query<{ id: string }>(
    `insert into leads (place_id, name, phone_e164, stage, batch_id, flow, reason) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [`pl-${n}`, `Lead ${n}`, phone, stage, batchId, extra.flow ?? null, extra.reason ?? null],
  );
  return rows[0]!.id;
}

async function row(id: string) {
  return (await pg.query<{ stage: string; page_url: string | null; loom_url: string | null }>(`select stage, page_url, loom_url from leads where id = $1`, [id])).rows[0]!;
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
  batchId = (await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Rio', 'rio', 'padaria', 5, '{}') returning id`)).rows[0]!.id;
}, 30000);

describe('qualifyLeads', () => {
  it('move quem está em revisar e ignora os outros', async () => {
    const a = await lead('revisar');
    const b = await lead('revisar');
    const c = await lead('completar');
    expect(await qualifyLeads(db(), [a, b, c])).toEqual({ moved: 2 });
    const jobs = (await pg.query<{ lead: string }>(`select payload->>'lead_id' as lead from jobs where type = 'instagram_media'`)).rows.map((r) => r.lead);
    expect(jobs).toEqual(expect.arrayContaining([a, b]));
    expect(jobs).not.toContain(c);
    expect((await row(a)).stage).toBe('completar');
    expect((await row(c)).stage).toBe('completar');
  });

  it('não faz nada com lista vazia', async () => {
    expect(await qualifyLeads(db(), [])).toEqual({ moved: 0 });
  });
});

describe('completeInfo', () => {
  it('leva completar para pagina', async () => {
    const id = await lead('completar');
    expect(await completeInfo(db(), id)).toEqual({ ok: true });
    expect((await row(id)).stage).toBe('pagina');
  });

  it('espera a extração terminar', async () => {
    const id = await lead('completar');
    await pg.query(`insert into lead_assets (lead_id, kind, status) values ($1, 'arquivo', 'extraindo')`, [id]);
    expect(await completeInfo(db(), id)).toEqual({ ok: false, error: 'Espere a extração terminar.' });
    expect((await row(id)).stage).toBe('completar');
  });

  it('pede o motivo no fluxo de melhorar site', async () => {
    const id = await lead('completar', { flow: 'melhorar_site' });
    expect(await completeInfo(db(), id)).toEqual({ ok: false, error: 'Preencha o motivo.' });
  });

  it('devolve STALE, sem lançar, quando o lead já mudou de etapa', async () => {
    const id = await lead('pagina');
    expect(await completeInfo(db(), id)).toEqual({ ok: false, error: STALE });
    expect(STALE).toBe('Este lead já mudou de etapa.');
    expect(await completeInfo(db(), '00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, error: STALE });
  });
});

describe('savePageUrl', () => {
  it('grava o link e leva pagina para video', async () => {
    const id = await lead('pagina');
    expect(await savePageUrl(db(), id, 'site.com')).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ stage: 'video', page_url: 'https://site.com/' });
  });

  it('recusa link inválido sem mudar o lead', async () => {
    const id = await lead('pagina');
    expect(await savePageUrl(db(), id, 'xx')).toEqual({ ok: false, error: 'Esse link não parece válido.' });
    expect(await row(id)).toMatchObject({ stage: 'pagina', page_url: null });
  });

  it('em video e crm só grava', async () => {
    const v = await lead('video');
    const c = await lead('crm');
    expect(await savePageUrl(db(), v, 'novo.com')).toEqual({ ok: true });
    expect(await savePageUrl(db(), c, 'novo.com')).toEqual({ ok: true });
    expect(await row(v)).toMatchObject({ stage: 'video', page_url: 'https://novo.com/' });
    expect(await row(c)).toMatchObject({ stage: 'crm', page_url: 'https://novo.com/' });
  });

  it('em outras etapas devolve STALE', async () => {
    const id = await lead('completar');
    expect(await savePageUrl(db(), id, 'site.com')).toEqual({ ok: false, error: STALE });
    expect((await row(id)).page_url).toBeNull();
  });
});

describe('saveLoomUrl', () => {
  it('grava o link, cria o contato e leva video para crm', async () => {
    const id = await lead('video');
    expect(await saveLoomUrl(db(), id, LOOM)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ stage: 'crm', loom_url: LOOM });
    const { rows } = await pg.query<{ status: string; id: string }>(`select id, status from contacts where lead_id = $1`, [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('novo');
    const ev = await pg.query(`select 1 from events where lead_id = $1 and type = 'etapa_crm' and data->>'contact_id' = $2`, [id, rows[0]!.id]);
    expect(ev.rows).toHaveLength(1);
  });

  it('recusa link que não é do Loom', async () => {
    const id = await lead('video');
    expect(await saveLoomUrl(db(), id, 'https://youtube.com/watch?v=1')).toEqual({ ok: false, error: 'Use um link do Loom (loom.com/share/…).' });
    expect(await saveLoomUrl(db(), id, 'xx')).toEqual({ ok: false, error: 'Esse link não parece válido.' });
    expect(await row(id)).toMatchObject({ stage: 'video', loom_url: null });
  });

  it('avisa quando o telefone já é contato de outro lead', async () => {
    const other = await lead('crm', { phone: '5531977776666' });
    await pg.query(`insert into contacts (name, phone_e164, origin, lead_id) values ('Dono', '5531977776666', 'batch', $1)`, [other]);
    const id = await lead('video', { phone: '5531977776666' });
    expect(await saveLoomUrl(db(), id, LOOM)).toEqual({
      ok: true,
      warning: 'Este telefone já é contato de outro lead: os links mostrados no CRM são os dele.',
    });
    expect((await row(id)).stage).toBe('crm');
  });

  it('sem celular (só e-mail) vai para Pronto para abordar sem criar contato', async () => {
    const id = await lead('video', { phone: null });
    expect(await saveLoomUrl(db(), id, LOOM)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ stage: 'crm', loom_url: LOOM });
  });

  it('em crm só grava, sem criar outro contato', async () => {
    const id = await lead('crm');
    expect(await saveLoomUrl(db(), id, LOOM)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ stage: 'crm', loom_url: LOOM });
    expect((await pg.query(`select 1 from contacts where lead_id = $1`, [id])).rows).toHaveLength(0);
  });

  it('em outras etapas devolve STALE', async () => {
    const id = await lead('pagina');
    expect(await saveLoomUrl(db(), id, LOOM)).toEqual({ ok: false, error: STALE });
  });
});

describe('stepBack', () => {
  it('volta video para pagina e pagina para completar', async () => {
    const v = await lead('video');
    const p = await lead('pagina');
    expect(await stepBack(db(), v, 'video')).toEqual({ ok: true });
    expect(await stepBack(db(), p, 'pagina')).toEqual({ ok: true });
    expect((await row(v)).stage).toBe('pagina');
    expect((await row(p)).stage).toBe('completar');
  });

  it('devolve STALE quando o lead já saiu da etapa', async () => {
    const id = await lead('crm');
    expect(await stepBack(db(), id, 'video')).toEqual({ ok: false, error: STALE });
    expect((await row(id)).stage).toBe('crm');
  });
});

describe('listLeads', () => {
  it('ordena por stage_changed_at, do mais antigo, quando pedido', async () => {
    const b = (await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('SP', 'sp', 'x', 1, '{}') returning id`)).rows[0]!.id;
    const ids: string[] = [];
    for (const [i, score] of [[1, 90], [2, 10], [3, 50]] as const) {
      const { rows } = await pg.query<{ id: string }>(
        `insert into leads (place_id, name, stage, batch_id, score, stage_changed_at) values ($1, 'x', 'pagina', $2, $3, now() - ($4 || ' hours')::interval) returning id`,
        [`ord-${i}`, b, score, String(i * 10)],
      );
      ids.push(rows[0]!.id);
    }
    expect((await listLeads(db(), b, ['pagina'], 'stage_changed_at')).map((l) => l.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect((await listLeads(db(), b, ['pagina'])).map((l) => l.id)).toEqual([ids[0], ids[2], ids[1]]);
  });
});
