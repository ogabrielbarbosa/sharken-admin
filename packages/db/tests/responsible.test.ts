import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createContact, getContact, setChatState } from '../src/contacts';
import { insertMessage } from '../src/messages';
import { listResponsibleEvents, openChat, setResponsible } from '../src/responsible';
import { scopeDb } from '../src/scope';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const [owner, ana, outsider] = [id(1), id(2), id(3)];
let pg: PGlite;
let ws: string;
let db: ReturnType<typeof fakeDb>;
let n = 0;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);`);
  for (const file of readdirSync(dir).sort()) {
    // Um aberto e um fechado de antes da 0029, para conferir o preenchimento.
    if (file.startsWith('0029')) {
      ws = (await pg.query<{ id: string }>(`insert into workspaces (name, slug) values ('T', 't') returning id`)).rows[0]!.id;
      await pg.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member')`, [ws, owner, ana]);
      for (const [name, state, sender] of [['velho-ana', 'aberto', ana], ['velho-dono', 'aberto', outsider], ['velho-fechado', 'fechado', ana]]) {
        const c = (await pg.query<{ id: string }>(`insert into contacts (workspace_id, name, phone_e164, origin, status, chat_state) values ($1, $2, $2, 'manual', 'novo', $3) returning id`, [ws, name, state])).rows[0]!.id;
        await pg.query(`insert into messages (workspace_id, contact_id, direction, sent_from, kind, body, status, sent_by, at) values ($1, $2, 'saida', 'painel', 'texto', 'oi', 'enviada', $3, now())`, [ws, c, sender]);
      }
    }
    await pg.exec(readFileSync(join(dir, file), 'utf8'));
  }
  db = scopeDb(fakeDb(pg), ws);
});

beforeEach(async () => {
  await pg.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [ws, ana]);
});

const mk = (extra: Partial<Parameters<typeof createContact>[1]> = {}) => createContact(db, { name: 'C', phone_e164: `5521900000${100 + ++n}`, origin: 'manual', status: 'novo', ...extra });
const who = async (contact: string) => (await getContact(db, contact))?.responsible_id ?? null;
const mkLead = async (responsible: string | null) => {
  const b = (await pg.query<{ id: string }>(`insert into batches (workspace_id, location, location_key, business_type, quantity, criteria) values ($1, 'x', 'x', 'y', 1, '{}') returning id`, [ws])).rows[0]!.id;
  return (await pg.query<{ id: string }>(`insert into leads (workspace_id, batch_id, name, responsible_id) values ($1, $2, 'L', $3) returning id`, [ws, b, responsible])).rows[0]!.id;
};

describe('responsável', () => {
  it('a migração preenche os abertos e não gera histórico', async () => {
    const { rows } = await pg.query(`select name, responsible_id from contacts where name like 'velho%' order by name`);
    expect(rows).toEqual([{ name: 'velho-ana', responsible_id: ana }, { name: 'velho-dono', responsible_id: owner }, { name: 'velho-fechado', responsible_id: null }]);
    expect((await pg.query(`select 1 from responsible_events`)).rows).toHaveLength(0);
  });

  it('abrir define quem abriu, reabrir troca, e cada troca fica registrada', async () => {
    const c = await mk({ chat_state: 'pendente' });
    expect(await who(c.id)).toBeNull();
    expect(await openChat(db, c.id, ana, 'pendente')).toBe(true);
    expect(await openChat(db, c.id, owner)).toBe(false);
    expect(await who(c.id)).toBe(ana);
    await setChatState(db, c.id, 'fechado');
    await openChat(db, c.id, owner);
    expect((await listResponsibleEvents(db, c.id)).map((e) => [e.from_id, e.to_id, e.by_id])).toEqual([[ana, owner, owner], [null, ana, ana]]);
  });

  it('a primeira abertura usa o responsável do lead, e depois são independentes', async () => {
    const lead = await mkLead(ana);
    const c = await mk({ chat_state: 'pendente', lead_id: lead });
    await openChat(db, c.id, owner, 'pendente');
    expect(await who(c.id)).toBe(ana);
    await setResponsible(db, 'leads', lead, null, owner);
    expect(await who(c.id)).toBe(ana);
  });

  it('aberto sem clique fica com o dono; quem não é membro não vira responsável', async () => {
    expect(await who((await mk({ chat_state: 'aberto' })).id)).toBe(owner);
    const c = await mk({ chat_state: 'pendente' });
    await openChat(db, c.id, outsider, 'pendente');
    expect(await who(c.id)).toBe(owner);
    await expect(setResponsible(db, 'contacts', c.id, outsider, owner)).rejects.toThrow('não é membro');
    await expect(setResponsible(db, 'contacts', c.id, null as never, owner)).rejects.toThrow('Escolha');
  });

  it('enviar num fechado: pelo painel fica com quem enviou; pelo celular mantém o anterior', async () => {
    const c = await mk({ chat_state: 'fechado' });
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', body: 'oi', sent_by: ana } as Parameters<typeof insertMessage>[1]);
    expect(await getContact(db, c.id)).toMatchObject({ chat_state: 'aberto', responsible_id: ana });
    await setChatState(db, c.id, 'fechado');
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'celular', body: 'oi 2' });
    expect(await getContact(db, c.id)).toMatchObject({ chat_state: 'aberto', responsible_id: ana });
  });

  it('remover o membro passa os abertos ao dono e solta os leads; apagar o workspace funciona', async () => {
    const lead = await mkLead(ana);
    const c = await mk({ chat_state: 'aberto', responsible_id: ana, responsible_by: ana });
    await pg.query(`delete from workspace_members where workspace_id = $1 and user_id = $2`, [ws, ana]);
    expect(await who(c.id)).toBe(owner);
    expect((await pg.query(`select responsible_id from leads where id = $1`, [lead])).rows).toEqual([{ responsible_id: null }]);
    await pg.query(`delete from workspaces where id = $1`, [ws]);
  });
});
