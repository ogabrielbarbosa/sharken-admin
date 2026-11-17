import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Contact, ContactStatus } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { countBoxes, createContact, findContactByLid, findContactByPhone, getContact, listContacts, setContactStatus, updateContact } from '../src/contacts';
import { applyStatus, findPendingEcho, firstContactsToday, insertMessage, listMessages, markRead, markStalePending } from '../src/messages';
import { fakeDb } from './fake-db';
import { TEST_WORKSPACE_DEFAULTS } from './test-defaults';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
let n = 0;

const phone = () => `5521${String(900000000 + ++n)}`;
const mk = (status: ContactStatus = 'novo', extra: Partial<Contact> = {}) =>
  createContact(db, { name: `Contato ${n + 1}`, phone_e164: phone(), origin: 'manual', status, ...extra });
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  await pg.exec(TEST_WORKSPACE_DEFAULTS);
  db = fakeDb(pg);
});

describe('mensagens', () => {
  it('applyStatus só avança', async () => {
    const c = await mk();
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', body: 'oi', status: 'pendente', external_id: 'ext-1' });
    expect(await applyStatus(db, 'ext-1', 'lida')).toBe(true);
    expect(await applyStatus(db, 'ext-1', 'entregue')).toBe(false);
    expect(await applyStatus(db, 'ext-1', 'erro')).toBe(false);
    const [m] = await listMessages(db, c.id);
    expect(m.status).toBe('lida');
  });

  it('erro só vale para pendente ou enviada, e recebida nunca muda', async () => {
    const c = await mk();
    await insertMessage(db, { contact_id: c.id, direction: 'saida', body: 'a', status: 'enviada', external_id: 'ext-2' });
    expect(await applyStatus(db, 'ext-2', 'erro')).toBe(true);
    expect(await applyStatus(db, 'ext-2', 'lida')).toBe(false); // erro é terminal
    const r = await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'x', external_id: 'ext-2r' });
    expect(r?.status).toBe('recebida');
    expect(await applyStatus(db, 'ext-2r', 'lida')).toBe(false);
    expect(await applyStatus(db, 'ext-2r', 'erro')).toBe(false);
  });

  it('insertMessage repetido devolve nulo', async () => {
    const c = await mk();
    const row = { contact_id: c.id, direction: 'entrada' as const, body: 'oi', external_id: 'ext-3' };
    expect(await insertMessage(db, row)).not.toBeNull();
    expect(await insertMessage(db, row)).toBeNull();
    expect((await getContact(db, c.id))?.unread_count).toBe(1);
  });

  it('insertMessage atualiza prévia e contadores', async () => {
    const c = await mk();
    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'x'.repeat(200), external_id: 'e1', at: ago(60_000) });
    let got = await getContact(db, c.id);
    expect(got?.last_message_preview).toHaveLength(120);
    expect(got?.last_inbound_at).not.toBeNull();
    expect(got?.unread_count).toBe(1);

    await insertMessage(db, { contact_id: c.id, direction: 'saida', kind: 'imagem', external_id: 'e2', at: ago(30_000) });
    got = await getContact(db, c.id);
    expect(got?.last_message_preview).toBe('📷 Imagem');
    expect(got?.last_outbound_at).not.toBeNull();

    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'atrasada', external_id: 'e3', at: ago(120_000) });
    got = await getContact(db, c.id);
    expect(got?.last_message_preview).toBe('📷 Imagem');
    expect(got?.unread_count).toBe(2);
  });

  it('findPendingEcho, markStalePending e markRead', async () => {
    const c = await mk();
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', body: 'olá', status: 'pendente', client_message_id: 'cm-1', at: ago(5 * 60_000) });
    expect((await findPendingEcho(db, c.id, 'olá', new Date(Date.now() - 10 * 60_000)))?.client_message_id).toBe('cm-1');
    expect(await findPendingEcho(db, c.id, 'outro texto', new Date(Date.now() - 10 * 60_000))).toBeNull();
    expect(await findPendingEcho(db, c.id, 'olá', new Date(Date.now() - 60_000))).toBeNull();

    expect(await markStalePending(db, new Date(Date.now() - 10 * 60_000))).toBe(0);
    expect(await markStalePending(db, new Date(Date.now() - 60_000))).toBe(1);
    expect((await listMessages(db, c.id))[0]).toMatchObject({ status: 'erro' });

    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'x', external_id: 'r1' });
    await markRead(db, c.id);
    expect((await getContact(db, c.id))?.unread_count).toBe(0);
  });

  it('firstContactsToday conta o dia de São Paulo', async () => {
    const c = await mk();
    const now = new Date('2026-11-10T14:00:00Z'); // 11:00 em São Paulo
    const base = { contact_id: c.id, direction: 'saida' as const, is_first_contact: true };
    await insertMessage(db, { ...base, external_id: 'f1', at: '2026-11-10T02:59:00Z' }); // ontem 23:59 em SP
    await insertMessage(db, { ...base, external_id: 'f2', at: '2026-11-10T03:00:00Z' }); // hoje 00:00 em SP
    await insertMessage(db, { ...base, external_id: 'f3', at: '2026-11-11T02:59:00Z' }); // hoje 23:59 em SP
    await insertMessage(db, { ...base, external_id: 'f4', at: '2026-11-11T03:00:00Z' }); // amanhã
    await insertMessage(db, { contact_id: c.id, direction: 'saida', external_id: 'f5', at: '2026-11-10T12:00:00Z' }); // não é primeiro
    expect(await firstContactsToday(db, now)).toBe(2);
  });
});

describe('contadores', () => {
  it('mensagem atrasada conta como não lida e move last_inbound_at, sem mexer na prévia', async () => {
    const c = await mk();
    await insertMessage(db, { contact_id: c.id, direction: 'saida', body: 'recente', external_id: 'l1', at: ago(30_000) });
    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'atrasada', external_id: 'l2', at: ago(60_000) });
    const got = await getContact(db, c.id);
    expect(got?.unread_count).toBe(1);
    expect(got?.last_inbound_at).not.toBeNull();
    expect(got?.last_message_preview).toBe('recente');
  });

  it('duas recebidas no mesmo instante contam as duas e a prévia acompanha', async () => {
    const c = await mk();
    const at = ago(10_000);
    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'um', external_id: 'm1', at });
    await insertMessage(db, { contact_id: c.id, direction: 'entrada', body: 'dois', external_id: 'm2', at });
    const got = await getContact(db, c.id);
    expect(got?.unread_count).toBe(2);
    expect(got?.last_message_preview).toBe('dois');
  });

  it('duplicata não mexe nos contadores do contato', async () => {
    const c = await mk();
    const row = { contact_id: c.id, direction: 'entrada' as const, body: 'oi', external_id: 'd1' };
    await insertMessage(db, row);
    const before = await getContact(db, c.id);
    expect(await insertMessage(db, { ...row, body: 'outro texto' })).toBeNull();
    expect(await getContact(db, c.id)).toEqual(before);
    expect(await insertMessage(db, { contact_id: c.id, direction: 'saida', body: 'a', client_message_id: 'dup-c' })).not.toBeNull();
    expect(await insertMessage(db, { contact_id: c.id, direction: 'saida', body: 'b', client_message_id: 'dup-c' })).toBeNull();
  });
});

describe('contatos', () => {
  it('findContactByPhone acha com e sem o nono dígito', async () => {
    const withNine = await createContact(db, { name: 'Com nove', phone_e164: '5511998887766', origin: 'manual' });
    const withoutNine = await createContact(db, { name: 'Sem nove', phone_e164: '552187654321', origin: 'manual' });
    expect((await findContactByPhone(db, '551198887766'))?.id).toBe(withNine.id);
    expect((await findContactByPhone(db, '5511998887766'))?.id).toBe(withNine.id);
    expect((await findContactByPhone(db, '5521987654321'))?.id).toBe(withoutNine.id);
    expect(await findContactByPhone(db, '5599911112222')).toBeNull();
  });

  it('findContactByLid e updateContact', async () => {
    const c = await mk();
    await updateContact(db, c.id, { whatsapp_lid: 'lid-123@lid' });
    expect((await findContactByLid(db, 'lid-123@lid'))?.id).toBe(c.id);
    expect(await findContactByLid(db, 'nenhum')).toBeNull();
  });

  it('setContactStatus valida, grava status_at e registra evento só com lead', async () => {
    const batch = await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Rio', 'rio', 'padaria', 5, '{}') returning id`);
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, phone_e164, stage, batch_id) values ('p-st', 'Padaria', '5521911110001', 'crm', $1) returning id`, [batch.rows[0].id])).rows[0];
    const c = await createContact(db, { name: 'Padaria', phone_e164: '5521911110001', origin: 'batch', lead_id: lead.id });
    await setContactStatus(db, c, 'perdido');
    expect((await getContact(db, c.id))?.status).toBe('perdido');
    const ev = await pg.query(`select type from events where lead_id = $1`, [lead.id]);
    expect(ev.rows).toEqual([{ type: 'contato_perdido' }, { type: 'etapa_sem_interesse' }]);
    expect((await pg.query<{ stage: string }>(`select stage from leads where id = $1`, [lead.id])).rows[0].stage).toBe('sem_interesse');

    const noLead = await mk('novo');
    await setContactStatus(db, noLead, 'contatado');
    expect((await pg.query(`select count(*)::int as n from events`)).rows[0]).toEqual({ n: 2 });
    await expect(setContactStatus(db, { ...noLead, status: 'contatado' }, 'contatado')).rejects.toThrow();

    const withFollowUp = await mk('follow_up', { follow_up_at: ago(1000) } as Partial<Contact>);
    await setContactStatus(db, withFollowUp, 'perdido');
    expect((await getContact(db, withFollowUp.id))?.follow_up_at).toBeNull();
  });

  it('nao_contatar bloqueia o telefone e leva o lead para nao_contatar', async () => {
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, phone_e164, stage) values ('p-nc', 'Loja', '5521911110002', 'crm') returning id`)).rows[0];
    const c = await createContact(db, { name: 'Loja', phone_e164: '5521911110002', origin: 'batch', lead_id: lead.id });
    await setContactStatus(db, c, 'nao_contatar');
    expect((await pg.query(`select phone_e164 from do_not_contact where phone_e164 = '5521911110002'`)).rows).toHaveLength(1);
    expect((await pg.query<{ stage: string }>(`select stage from leads where id = $1`, [lead.id])).rows[0].stage).toBe('nao_contatar');
    // Repetir não quebra (on conflict do nothing).
    await pg.query(`update contacts set status = 'novo' where id = $1`, [c.id]);
    await expect(setContactStatus(db, { ...c, status: 'novo' }, 'nao_contatar')).resolves.toBeUndefined();
  });
});

describe('caixas', () => {
  it('countBoxes e listContacts com um contato de cada status', async () => {
    const t = await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Lista', 'lista', 'x', 1, '{}') returning id`);
    const batchId = t.rows[0].id;
    await pg.exec(`delete from messages; delete from contacts;`);
    const mk2 = (status: ContactStatus, extra: Partial<Contact> = {}) => mk(status, { batch_id: batchId, ...extra });
    const novo = await mk2('novo');
    const contatado = await mk2('contatado');
    const followUp = await mk2('follow_up');
    const conversa = await mk2('em_conversa');
    const fechado = await mk2('fechado');
    const perdido = await mk2('perdido');
    const naoContatar = await mk2('nao_contatar', { follow_up_at: ago(1000) });

    let boxes = await countBoxes(db);
    expect(boxes).toEqual({ hoje: 0, novos: 1, aguardando: 2, em_conversa: 1, fechados: 1, perdidos: 2, todos: 7 });
    expect(await listContacts(db, { box: 'perdidos' })).toHaveLength(2);

    // Hoje: recebida sem resposta.
    await insertMessage(db, { contact_id: conversa.id, direction: 'entrada', body: 'oi', external_id: 'h1', at: ago(60_000) });
    // Perdido com recebida sem resposta: fica fora de Hoje.
    await insertMessage(db, { contact_id: perdido.id, direction: 'entrada', body: 'x', external_id: 'hp', at: ago(10_000) });
    // Respondida depois: sai (follow_up).
    await insertMessage(db, { contact_id: followUp.id, direction: 'entrada', body: 'oi', external_id: 'h2', at: ago(60_000) });
    await insertMessage(db, { contact_id: followUp.id, direction: 'saida', body: 'olá', external_id: 'h3', at: ago(30_000) });
    // Follow-up vencido.
    await updateContact(db, contatado.id, { follow_up_at: ago(1000) });
    // Follow-up futuro: não entra.
    await updateContact(db, followUp.id, { follow_up_at: new Date(Date.now() + 86_400_000).toISOString() });
    // Cobrança vencida do cliente.
    const client = (await pg.query<{ id: string }>(`insert into clients (legal_name, document, contact_id) values ('Fechado Ltda', '1', $1) returning id`, [fechado.id])).rows[0];
    const service = (await pg.query<{ id: string }>(`insert into services (client_id, name, kind, amount_cents, start_date) values ($1, 's', 'unico', 100, now()) returning id`, [client.id])).rows[0];
    await pg.query(`insert into charges (service_id, description, amount_cents, due_date, method, status) values ($1, 'c', 100, now(), 'pix', 'vencido')`, [service.id]);

    boxes = await countBoxes(db);
    expect(boxes.hoje).toBe(3);
    expect(new Set((await listContacts(db, { box: 'hoje' })).map((c) => c.id))).toEqual(new Set([conversa.id, contatado.id, fechado.id]));
    expect((await listContacts(db, { box: 'novos' })).map((c) => c.id)).toEqual([novo.id]);
    expect(new Set((await listContacts(db, { box: 'aguardando' })).map((c) => c.id))).toEqual(new Set([contatado.id, followUp.id]));
    expect(new Set((await listContacts(db, { box: 'perdidos' })).map((c) => c.id))).toEqual(new Set([perdido.id, naoContatar.id]));
    expect(await listContacts(db, { box: 'todos', batchId })).toHaveLength(7);
    expect(await listContacts(db, { box: 'todos', batchId: '00000000-0000-0000-0000-000000000000' })).toHaveLength(0);
  });

  it('busca por nome e telefone e ordena por última mensagem', async () => {
    await pg.exec(`delete from messages; delete from contacts;`);
    const a = await createContact(db, { name: 'Padaria Sol', phone_e164: '5521955550001', origin: 'manual' });
    const b = await createContact(db, { name: 'Oficina Lua', phone_e164: '5521955550002', origin: 'manual' });
    await insertMessage(db, { contact_id: a.id, direction: 'entrada', body: 'a', external_id: 's1', at: ago(120_000) });
    await insertMessage(db, { contact_id: b.id, direction: 'entrada', body: 'b', external_id: 's2', at: ago(60_000) });
    expect((await listContacts(db, { box: 'todos' })).map((c) => c.id)).toEqual([b.id, a.id]);
    expect((await listContacts(db, { box: 'todos', search: 'padaria' })).map((c) => c.id)).toEqual([a.id]);
    expect((await listContacts(db, { box: 'todos', search: '550002' })).map((c) => c.id)).toEqual([b.id]);
    expect(await listContacts(db, { box: 'todos', search: 'a,b)' })).toEqual([]);
  });

  it('Novos ordena pela pontuação do lead', async () => {
    await pg.exec(`delete from messages; delete from contacts;`);
    const mkLead = async (key: string, score: number) =>
      (await pg.query<{ id: string }>(`insert into leads (place_id, name, stage, score) values ($1, $1, 'crm', $2) returning id`, [key, score])).rows[0].id;
    const low = await createContact(db, { name: 'Baixo', phone_e164: phone(), origin: 'batch', lead_id: await mkLead('l-low', 10) });
    const high = await createContact(db, { name: 'Alto', phone_e164: phone(), origin: 'batch', lead_id: await mkLead('l-high', 90) });
    expect((await listContacts(db, { box: 'novos' })).map((c) => c.id)).toEqual([high.id, low.id]);
  });
});
