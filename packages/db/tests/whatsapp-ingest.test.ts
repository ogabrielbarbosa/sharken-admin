import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { ContactStatus, WhatsAppEvent } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { countChats, createContact, findContactByPhone, getContact, setChatState } from '../src/contacts';
import { insertMessage, listMessages } from '../src/messages';
import { importHistory, ingestEvent } from '../src/whatsapp-ingest';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
let n = 0;
const phone = () => `5521${String(910000000 + ++n)}`;
const now = new Date('2026-11-11T12:00:00Z');

type Msg = Extract<WhatsAppEvent, { kind: 'message' }>;
const msg = (over: Partial<Msg> & { phoneE164: string | null }): Msg => ({
  kind: 'message', externalId: `ext-${++n}`, lid: null, pushName: null, fromMe: false, text: 'oi', media: null, type: over.media?.kind ?? 'texto', meta: {}, at: now, ...over,
});
const mk = (status: ContactStatus, extra = {}) => createContact(db, { name: 'Fulano', phone_e164: phone(), origin: 'manual', status, ...extra });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
  `);
  for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(join(dir, file), 'utf8'));
  db = fakeDb(pg);
});

describe('ingestEvent', () => {
  it('número desconhecido cria contato whatsapp_direto em_conversa', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, pushName: 'Maria', text: 'Olá' }), now);
    const c = await findContactByPhone(db, p);
    expect(c).toMatchObject({ name: 'Maria', origin: 'whatsapp_direto', status: 'em_conversa', unread_count: 1 });
    expect(c?.responded_at).not.toBeNull();
  });

  it('a mesma mensagem duas vezes grava uma linha', async () => {
    const e = msg({ phoneE164: phone() });
    await ingestEvent(db, e, now);
    await ingestEvent(db, e, now);
    const c = (await findContactByPhone(db, e.phoneE164!))!;
    expect(await listMessages(db, c.id)).toHaveLength(1);
    expect((await getContact(db, c.id))!.unread_count).toBe(1);
  });

  it('só com LID e sem telefone não cria contato', async () => {
    const before = (await pg.query('select count(*)::int as n from contacts')).rows[0] as { n: number };
    await ingestEvent(db, msg({ phoneE164: null, lid: '999111' }), now);
    expect(((await pg.query('select count(*)::int as n from contacts')).rows[0] as { n: number }).n).toBe(before.n);
  });

  it('acha o contato pelo LID e completa o LID de quem veio pelo telefone', async () => {
    const c = await mk('contatado');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, lid: 'lid-77' }), now);
    expect((await getContact(db, c.id))!.whatsapp_lid).toBe('lid-77');
    await ingestEvent(db, msg({ phoneE164: null, lid: 'lid-77', text: 'de novo' }), now);
    expect(await listMessages(db, c.id)).toHaveLength(2);
  });

  it('eco fromMe liga à pendente do painel, sem duplicar', async () => {
    const c = await mk('contatado');
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', body: 'Oi, tudo bem?', status: 'pendente', client_message_id: 'cm-1' });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, fromMe: true, text: 'Oi, tudo bem?', externalId: 'echo-1' }), new Date());
    const list = await listMessages(db, c.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ external_id: 'echo-1', status: 'enviada', sent_from: 'painel' });
  });

  it('eco com external_id já gravado não faz nada', async () => {
    const c = await mk('contatado');
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', body: 'x', status: 'enviada', external_id: 'echo-2' });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, fromMe: true, text: 'x', externalId: 'echo-2' }), new Date());
    expect(await listMessages(db, c.id)).toHaveLength(1);
  });

  it('fromMe sem pendente grava como enviada pelo celular', async () => {
    const c = await mk('contatado');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, fromMe: true, text: 'pelo celular' }), now);
    const [m] = await listMessages(db, c.id);
    expect(m).toMatchObject({ direction: 'saida', sent_from: 'celular', status: 'enviada' });
    expect((await getContact(db, c.id))!.status).toBe('contatado');
  });

  it('resposta de contatado vira em_conversa com responded_at', async () => {
    const c = await mk('contatado');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    const after = (await getContact(db, c.id))!;
    expect(after.status).toBe('em_conversa');
    expect(after.responded_at).not.toBeNull();
  });

  it('perdido que responde volta para em_conversa', async () => {
    const c = await mk('perdido');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    expect((await getContact(db, c.id))!.status).toBe('em_conversa');
  });

  it('nao_contatar continua', async () => {
    const c = await mk('nao_contatar');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    expect((await getContact(db, c.id))!.status).toBe('nao_contatar');
    expect(await listMessages(db, c.id)).toHaveLength(1);
  });

  it('mídia sem arquivo vira tarefa download_media', async () => {
    const c = await mk('em_conversa');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, text: 'foto', media: { kind: 'imagem', mime: 'image/jpeg', url: 'https://x/y.enc', base64: null } }), now);
    const [m] = await listMessages(db, c.id);
    expect(m).toMatchObject({ kind: 'imagem', body: 'foto', media_path: null });
    const jobs = (await pg.query(`select payload from jobs where type = 'download_media' and payload->>'message_id' = $1`, [m.id])).rows;
    expect(jobs).toHaveLength(1);
  });

  it('pedido para parar grava evento no lead', async () => {
    const batch = await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Rio', 'rio', 'padaria', 5, '{}') returning id`);
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, stage, batch_id) values ($1, 'L', 'video', $2) returning id`, [`p-${++n}`, batch.rows[0]!.id])).rows[0]!;
    const c = await mk('contatado', { lead_id: lead.id });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, text: 'não quero, pode parar' }), now);
    const events = (await pg.query(`select data from events where lead_id = $1 and type = 'pedido_parar'`, [lead.id])).rows;
    expect(events).toHaveLength(1);
    expect(((await pg.query('select responded_at from leads where id = $1', [lead.id])).rows[0] as { responded_at: string | null }).responded_at).not.toBeNull();
    expect((await getContact(db, c.id))!.status).toBe('em_conversa'); // status não muda sozinho para além da resposta
  });

  it('fromMe para número desconhecido: nome é o número e status contatado', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, fromMe: true, pushName: 'Gabriel', text: 'Olá!' }), now);
    expect(await findContactByPhone(db, p)).toMatchObject({ name: p, origin: 'whatsapp_direto', status: 'contatado' });
  });

  it('dois webhooks em paralelo para um número novo não perdem mensagem', async () => {
    const p = phone();
    await Promise.all([ingestEvent(db, msg({ phoneE164: p, text: 'a' }), now), ingestEvent(db, msg({ phoneE164: p, text: 'b' }), now)]);
    const c = (await findContactByPhone(db, p))!;
    expect(await listMessages(db, c.id)).toHaveLength(2);
  });

  it('perdido que responde reabre o lead sem_interesse para crm', async () => {
    const batch = await pg.query<{ id: string }>(`insert into batches (location, location_key, business_type, quantity, criteria) values ('Rio', 'rio', 'padaria', 5, '{}') returning id`);
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, stage, batch_id) values ($1, 'L', 'sem_interesse', $2) returning id`, [`p-${++n}`, batch.rows[0]!.id])).rows[0]!;
    const c = await mk('perdido', { lead_id: lead.id });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    expect((await getContact(db, c.id))!.status).toBe('em_conversa');
    expect(((await pg.query('select stage from leads where id = $1', [lead.id])).rows[0] as { stage: string }).stage).toBe('crm');
  });

  it('conexão grava e atualiza whatsapp_connection', async () => {
    await ingestEvent(db, { kind: 'connection', state: 'conectado' }, now);
    await ingestEvent(db, { kind: 'connection', state: 'desconectado' }, now);
    const rows = (await pg.query('select state from whatsapp_connection')).rows as { state: string }[];
    expect(rows).toEqual([{ state: 'desconectado' }]);
  });

  it('resposta em contato fechado marca responded_at e mantém o status', async () => {
    const c = await mk('fechado');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    const after = (await getContact(db, c.id))!;
    expect(after.status).toBe('fechado');
    expect(after.responded_at).not.toBeNull();
  });
});

describe('estado do atendimento', () => {
  it('número desconhecido entra como pendente', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, pushName: 'Nova' }), now);
    expect((await findContactByPhone(db, p))?.chat_state).toBe('pendente');
  });
  it('fechado que recebe mensagem vira pendente', async () => {
    const c = await mk('em_conversa', { chat_state: 'fechado' });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    expect((await getContact(db, c.id))?.chat_state).toBe('pendente');
  });
  it('aberto que recebe mensagem continua aberto', async () => {
    const c = await mk('em_conversa');
    await ingestEvent(db, msg({ phoneE164: c.phone_e164 }), now);
    expect((await getContact(db, c.id))?.chat_state).toBe('aberto');
  });
  it('mensagem enviada em atendimento fechado reabre', async () => {
    const c = await mk('em_conversa', { chat_state: 'fechado' });
    await insertMessage(db, { contact_id: c.id, direction: 'saida', sent_from: 'painel', kind: 'texto', body: 'Oi', status: 'enviada', at: now.toISOString() });
    expect((await getContact(db, c.id))?.chat_state).toBe('aberto');
  });
  it('setChatState só abre o que ainda está pendente', async () => {
    const c = await mk('em_conversa', { chat_state: 'pendente' });
    expect(await setChatState(db, c.id, 'aberto', 'pendente')).toBe(true);
    expect(await setChatState(db, c.id, 'aberto', 'pendente')).toBe(false);
    await setChatState(db, c.id, 'fechado');
    expect((await getContact(db, c.id))?.chat_state).toBe('fechado');
  });
  it('foto do perfil atualiza o contato e dá nome a quem só tinha o número', async () => {
    const p = phone();
    const c = await createContact(db, { name: p, phone_e164: p, origin: 'whatsapp_direto' });
    await ingestEvent(db, { kind: 'profile', phoneE164: p, lid: null, pushName: 'Joana', avatarUrl: 'https://pps.whatsapp.net/x.jpg' }, now);
    expect(await getContact(db, c.id)).toMatchObject({ name: 'Joana', avatar_url: 'https://pps.whatsapp.net/x.jpg' });
  });
  it('contagem por estado', async () => {
    const counts = await countChats(db);
    expect(counts.pendente).toBeGreaterThan(0);
    expect(Object.keys(counts).sort()).toEqual(['aberto', 'fechado', 'pendente', 'pendente_nao_lidas']);
  });
});

describe('nome pelo perfil', () => {
  it('mensagem recebida com nome preenche o contato que só tinha o número', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, fromMe: true, text: 'oi' }), now);
    await ingestEvent(db, msg({ phoneE164: p, pushName: 'Carla', text: 'olá' }), now);
    expect((await findContactByPhone(db, p))!.name).toBe('Carla');
  });
});

describe('importHistory', () => {
  it('cria as conversas fechadas, sem não lidas, e repetir não duplica', async () => {
    const p = phone();
    const events = [
      msg({ phoneE164: p, pushName: 'Joana', text: 'oi', at: new Date('2026-11-10T10:00:00Z') }),
      msg({ phoneE164: p, fromMe: true, text: 'opa', at: new Date('2026-11-10T10:01:00Z') }),
      msg({ phoneE164: p, pushName: 'Joana', text: 'tudo bem?', at: new Date('2026-11-10T10:02:00Z') }),
    ];
    expect(await importHistory(db, events, now)).toEqual({ messages: 3, contacts: 1 });
    const c = (await findContactByPhone(db, p))!;
    expect(c).toMatchObject({ name: 'Joana', chat_state: 'fechado', unread_count: 0 });
    expect(await listMessages(db, c.id)).toHaveLength(3);

    expect(await importHistory(db, events, now)).toEqual({ messages: 0, contacts: 0 });
    expect(await listMessages(db, c.id)).toHaveLength(3);
  });

  it('completa o nome pela agenda só onde o nome ainda é o número', async () => {
    const p = phone();
    const named = await mk('contatado');
    await importHistory(db, [msg({ phoneE164: p, fromMe: true, text: 'oi' })], now, [
      { kind: 'profile', phoneE164: p, lid: null, pushName: 'Daniel', avatarUrl: null },
      { kind: 'profile', phoneE164: named.phone_e164, lid: null, pushName: 'Outro', avatarUrl: null },
    ]);
    expect((await findContactByPhone(db, p))!.name).toBe('Daniel');
    expect((await getContact(db, named.id))!.name).toBe('Fulano');
  });

  it('contato que já existia também termina fechado', async () => {
    const c = await mk('contatado', { chat_state: 'aberto' });
    await importHistory(db, [msg({ phoneE164: c.phone_e164, text: 'voltei' })], now);
    expect(await getContact(db, c.id)).toMatchObject({ chat_state: 'fechado', unread_count: 0 });
  });
});

describe('reply recebido', () => {
  it('guarda a citação com o trecho que veio no webhook', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, text: 'Pode mandar de novo?', quoted: { externalId: 'OUT-1', text: 'Segue a página' } }), now);
    const c = (await findContactByPhone(db, p))!;
    expect((await listMessages(db, c.id))[0]).toMatchObject({ quoted_external_id: 'OUT-1', quoted_preview: 'Segue a página' });
  });

  it('sem trecho no webhook usa a original que já está no CRM', async () => {
    const c = await mk('contatado');
    await insertMessage(db, { contact_id: c.id, direction: 'saida', body: 'Preparei uma página', status: 'enviada', external_id: 'OUT-2', at: now.toISOString() });
    await ingestEvent(db, msg({ phoneE164: c.phone_e164, text: 'Gostei', quoted: { externalId: 'OUT-2', text: null } }), now);
    const reply = (await listMessages(db, c.id)).find((m) => m.direction === 'entrada')!;
    expect(reply).toMatchObject({ quoted_external_id: 'OUT-2', quoted_preview: 'Preparei uma página' });
  });

  it('mensagem comum fica sem citação', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p }), now);
    const c = (await findContactByPhone(db, p))!;
    expect((await listMessages(db, c.id))[0]).toMatchObject({ quoted_external_id: null, quoted_preview: null });
  });
});

describe('tipos de mensagem e eventos sobre mensagens', () => {
  const thread = async (p: string) => listMessages(db, (await findContactByPhone(db, p))!.id);

  it('figurinha grava o tipo, os detalhes e pede a mídia; a prévia diz "Figurinha"', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, text: null, type: 'sticker', meta: { animated: true }, media: { kind: 'sticker', mime: 'image/webp', url: null, base64: null } }), now);
    expect((await thread(p))[0]).toMatchObject({ kind: 'sticker', meta: { animated: true }, reactions: [], edited_at: null, deleted_at: null });
    expect((await findContactByPhone(db, p))!.last_message_preview).toBe('Figurinha');
  });

  it('áudio com duração aparece na prévia com o tempo', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, text: null, type: 'audio', meta: { seconds: 75, ptt: true }, media: { kind: 'audio', mime: 'audio/ogg', url: null, base64: null } }), now);
    expect((await findContactByPhone(db, p))!.last_message_preview).toBe('🎤 Áudio (1:15)');
  });

  it('reação: uma por lado, a nova troca a anterior e vazia remove', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'R-ALVO' }), now);
    const actor = { phoneE164: p, lid: null, at: now };
    await ingestEvent(db, { kind: 'reaction', targetExternalId: 'R-ALVO', emoji: '❤️', fromMe: false, ...actor });
    await ingestEvent(db, { kind: 'reaction', targetExternalId: 'R-ALVO', emoji: '👍', fromMe: true, ...actor });
    await ingestEvent(db, { kind: 'reaction', targetExternalId: 'R-ALVO', emoji: '😂', fromMe: false, ...actor });
    expect((await thread(p))[0]!.reactions.map((r) => [r.from, r.emoji])).toEqual([['eu', '👍'], ['contato', '😂']]);
    await ingestEvent(db, { kind: 'reaction', targetExternalId: 'R-ALVO', emoji: null, fromMe: true, ...actor });
    expect((await thread(p))[0]!.reactions.map((r) => r.emoji)).toEqual(['😂']);
    // Reação a mensagem que não está no CRM: nada acontece.
    await ingestEvent(db, { kind: 'reaction', targetExternalId: 'NAO-EXISTE', emoji: '❤️', fromMe: false, ...actor });
  });

  it('edição troca o texto e guarda o original; exclusão marca sem apagar', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'E-ALVO', text: 'primeiro' }), now);
    await ingestEvent(db, { kind: 'edit', targetExternalId: 'E-ALVO', text: 'segundo', at: now });
    await ingestEvent(db, { kind: 'edit', targetExternalId: 'E-ALVO', text: 'terceiro', at: now });
    const edited = (await thread(p))[0]!;
    expect(edited).toMatchObject({ body: 'terceiro', meta: { original_body: 'primeiro' } });
    expect(new Date(edited.edited_at!).getTime()).toBe(now.getTime());
    await ingestEvent(db, { kind: 'revoke', targetExternalId: 'E-ALVO', at: now });
    expect((await thread(p))[0]).toMatchObject({ body: 'terceiro' });
    expect((await thread(p))[0]!.deleted_at).not.toBeNull();
  });

  it('voto em enquete guarda as opções de cada lado', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'P-ALVO', text: 'Dia?', type: 'enquete', meta: { poll: { name: 'Dia?', options: ['Seg', 'Ter'], multiple: false } } }), now);
    await ingestEvent(db, { kind: 'poll_vote', targetExternalId: 'P-ALVO', options: ['Ter'], fromMe: false, phoneE164: p, lid: null, at: now });
    expect((await thread(p))[0]!.meta.poll).toMatchObject({ votes: { contato: ['Ter'] } });
  });

  it('histórico aplica reações depois das mensagens', async () => {
    const p = phone();
    await importHistory(db, [
      msg({ phoneE164: p, externalId: 'H-1' }),
      { kind: 'reaction', targetExternalId: 'H-1', emoji: '🙏', fromMe: true, phoneE164: p, lid: null, at: now },
    ], now);
    expect((await thread(p))[0]!.reactions).toMatchObject([{ from: 'eu', emoji: '🙏' }]);
  });
});

describe('importar de novo completa os detalhes', () => {
  it('mensagem antiga sem meta ganha o tipo e os detalhes; com meta, fica como está', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'OLD-1', text: null, type: 'outro', meta: {}, media: { kind: 'sticker', mime: 'image/webp', url: null, base64: null } }), now);
    await importHistory(db, [msg({ phoneE164: p, externalId: 'OLD-1', text: null, type: 'sticker', meta: { animated: true } })], now);
    const c = (await findContactByPhone(db, p))!;
    expect((await listMessages(db, c.id))[0]).toMatchObject({ kind: 'sticker', meta: { animated: true } });
    await importHistory(db, [msg({ phoneE164: p, externalId: 'OLD-1', text: null, type: 'sticker', meta: { animated: false } })], now);
    expect((await listMessages(db, c.id))[0]!.meta).toEqual({ animated: true });
  });
});

describe('prévia da lista acompanha edição e exclusão da última mensagem', () => {
  it('edita e apaga a última: a prévia muda; numa mensagem antiga, não', async () => {
    const p = phone();
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'PV-1', text: 'antiga', at: new Date(now.getTime() - 60_000) }), now);
    await ingestEvent(db, msg({ phoneE164: p, externalId: 'PV-2', text: 'errada' }), now);
    await ingestEvent(db, { kind: 'edit', targetExternalId: 'PV-2', text: 'certa', at: now });
    expect((await findContactByPhone(db, p))!.last_message_preview).toBe('certa');
    await ingestEvent(db, { kind: 'edit', targetExternalId: 'PV-1', text: 'antiga editada', at: now });
    expect((await findContactByPhone(db, p))!.last_message_preview).toBe('certa');
    await ingestEvent(db, { kind: 'revoke', targetExternalId: 'PV-2', at: now });
    expect((await findContactByPhone(db, p))!.last_message_preview).toBe('🚫 Mensagem apagada');
  });
});
