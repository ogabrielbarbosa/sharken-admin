import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { ContactStatus } from '@lps/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContact, getContact, updateContact } from '../src/contacts';
import { listMessages } from '../src/messages';
import { retryMessage, sendMessage } from '../src/send-message';
import { fakeDb } from './fake-db';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
let pg: PGlite;
let db: ReturnType<typeof fakeDb>;
let n = 0;
const phone = () => `5521${String(920000000 + ++n)}`;
const now = new Date('2026-11-11T12:00:00Z');
const day = 86_400_000;

const ok = (externalId = `ext-${++n}`) => ({ sendText: async () => ({ externalId }) });
const failing = (invalidNumber = false) => ({
  sendText: async () => {
    throw Object.assign(new Error('boom'), { invalidNumber });
  },
});
const mk = (status: ContactStatus, extra = {}) => createContact(db, { name: 'Fulano', phone_e164: phone(), origin: 'manual', status, ...extra });
const send = (contactId: string, provider = ok(), text = 'Oi!', at = now) => sendMessage(db, provider, { contactId, text, clientMessageId: `c-${++n}` }, at);

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

async function leadWithSite() {
  const batch = (await pg.query(`insert into batches (name) values ('b') returning id`).catch(() => null)) as { rows: { id: string }[] } | null;
  return batch;
}

describe('sendMessage', () => {
  it('primeiro envio: contatado, first_contact_at, follow-up em 3 dias, mensagem enviada', async () => {
    const c = await mk('novo');
    const m = await send(c.id);
    expect(m).toMatchObject({ status: 'enviada', is_first_contact: true, is_follow_up: false, sent_from: 'painel', direction: 'saida' });
    expect(m.external_id).toBeTruthy();
    const after = (await getContact(db, c.id))!;
    expect(after.status).toBe('contatado');
    expect(new Date(after.first_contact_at!).getTime()).toBe(now.getTime());
    expect(new Date(after.follow_up_at!).getTime()).toBe(now.getTime() + 3 * day);
  });

  it('primeiro envio grava sent_at e expires_at (+24 h) da página do lead, uma vez só', async () => {
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, stage) values ($1, 'Padaria', 'crm') returning id`, [`p-send-${++n}`])).rows[0]!;
    await pg.query(`insert into sites (lead_id, slug, content, status, published_at) values ($1, $2, '{}', 'modelo', $3)`, [lead.id, `s${++n}`, now.toISOString()]);
    const c = await mk('novo', { lead_id: lead.id });
    await send(c.id);
    const site = (await pg.query(`select sent_at, expires_at from sites where lead_id = $1`, [lead.id])).rows[0] as { sent_at: Date; expires_at: Date };
    expect(site.sent_at.getTime()).toBe(now.getTime());
    expect(site.expires_at.getTime()).toBe(now.getTime() + 24 * 3600_000);
  });

  it('falha do provedor: mensagem erro e status do contato intacto', async () => {
    const c = await mk('novo');
    await expect(send(c.id, failing())).rejects.toThrow('boom');
    const msgs = await listMessages(db, c.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ status: 'erro', error: 'boom' });
    const after = (await getContact(db, c.id))!;
    expect(after.status).toBe('novo');
    expect(after.first_contact_at).toBeNull();
    expect(after.follow_up_at).toBeNull();
  });

  it('invalidNumber vira "Número sem WhatsApp"', async () => {
    const c = await mk('novo');
    await expect(send(c.id, failing(true))).rejects.toThrow('Número sem WhatsApp');
    expect((await listMessages(db, c.id))[0]).toMatchObject({ status: 'erro', error: 'Número sem WhatsApp' });
  });

  it('nao_contatar lança e nada é gravado', async () => {
    const c = await mk('nao_contatar');
    await expect(send(c.id)).rejects.toThrow('Este contato pediu para não receber mensagens.');
    expect(await listMessages(db, c.id)).toHaveLength(0);
  });

  it('telefone em do_not_contact é recusado', async () => {
    const c = await mk('novo');
    await pg.query(`insert into do_not_contact (phone_e164, reason) values ($1, 'x')`, [c.phone_e164]);
    await expect(send(c.id)).rejects.toThrow('não receber');
    expect(await listMessages(db, c.id)).toHaveLength(0);
  });

  it('WhatsApp desconectado bloqueia; sem linha de conexão, envia', async () => {
    const c = await mk('novo');
    await pg.query(`delete from whatsapp_connection`);
    await expect(send(c.id)).resolves.toMatchObject({ status: 'enviada' });
    await pg.query(`insert into whatsapp_connection (id, state) values (1, 'desconectado') on conflict (id) do update set state = 'desconectado'`);
    const c2 = await mk('novo');
    await expect(send(c2.id)).rejects.toThrow('WhatsApp desconectado');
    expect(await listMessages(db, c2.id)).toHaveLength(0);
    await pg.query(`delete from whatsapp_connection`);
  });

  it('segunda mensagem, mesmo antes da data, é o follow-up: soma 1 e limpa o lembrete; a terceira é recusada', async () => {
    const c = await mk('novo');
    await send(c.id);
    const m = await send(c.id);
    expect(m.is_follow_up).toBe(true);
    expect(await getContact(db, c.id)).toMatchObject({ status: 'follow_up', follow_ups_without_reply: 1, follow_up_at: null });
    await expect(send(c.id)).rejects.toThrow('Já foi enviado um follow-up sem resposta.');
    expect(await listMessages(db, c.id)).toHaveLength(2);
  });

  it('mudar o status não burla o limite: terceira mensagem bloqueada após voltar para novo ou contatado', async () => {
    const c = await mk('novo');
    await send(c.id);
    await send(c.id);
    for (const status of ['novo', 'contatado'] as const) {
      await updateContact(db, c.id, { status });
      await expect(send(c.id)).rejects.toThrow('Já foi enviado um follow-up sem resposta.');
    }
    expect(await listMessages(db, c.id)).toHaveLength(2);
  });

  it('depois da resposta não há limite', async () => {
    const c = await mk('novo');
    await send(c.id);
    await send(c.id);
    await updateContact(db, c.id, { responded_at: now.toISOString(), status: 'em_conversa' });
    await expect(send(c.id)).resolves.toMatchObject({ is_follow_up: false, is_first_contact: false });
    await expect(send(c.id)).resolves.toMatchObject({ status: 'enviada' });
  });

  it('mensagem com erro não conta para o limite', async () => {
    const c = await mk('novo');
    await expect(send(c.id, failing())).rejects.toThrow();
    await expect(send(c.id)).resolves.toMatchObject({ is_first_contact: true });
  });

  it('com lead ligado grava histórico, contacted_at e status', async () => {
    const lead = (await pg.query<{ id: string }>(`insert into leads (place_id, name, stage) values ($1, 'Padaria', 'crm') returning id`, [`p-ev-${++n}`])).rows[0]!;
    const c = await mk('novo', { lead_id: lead.id });
    const m = await send(c.id);
    const ev = (await pg.query<{ type: string; data: Record<string, unknown> }>(`select type, data from events where lead_id = $1 order by created_at`, [lead.id])).rows;
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['mensagem_enviada', 'contato_contatado']));
    expect(ev.find((e) => e.type === 'mensagem_enviada')!.data).toMatchObject({ message_id: m.id, kind: 'primeiro' });
    expect(ev.find((e) => e.type === 'contato_contatado')!.data).toMatchObject({ por: 'envio' });
    const l = (await pg.query<{ contacted_at: Date | null }>(`select contacted_at from leads where id = $1`, [lead.id])).rows[0]!;
    expect(l.contacted_at?.getTime()).toBe(now.getTime());
  });

  it('resposta que chegou durante o envio não é sobrescrita', async () => {
    const c = await mk('novo');
    const provider = {
      sendText: async () => {
        await pg.query(`update contacts set status = 'em_conversa', responded_at = now() where id = $1`, [c.id]);
        return { externalId: `r-${++n}` };
      },
    };
    await send(c.id, provider);
    const after = (await getContact(db, c.id))!;
    expect(after.status).toBe('em_conversa');
    expect(after.first_contact_at).not.toBeNull();
  });

  it('falha de banco depois do provedor não vira erro para quem enviou', async () => {
    const c = await mk('novo');
    const provider = {
      sendText: async () => {
        await pg.query(`alter table contacts add constraint tmp_fail check (status <> 'contatado') not valid`);
        return { externalId: `x-${++n}` };
      },
    };
    try {
      await expect(send(c.id, provider)).resolves.toMatchObject({ status: 'enviada' });
    } finally {
      await pg.query(`alter table contacts drop constraint tmp_fail`);
    }
  });

  it('enviar com follow-up vencido a quem já respondeu limpa o follow-up', async () => {
    const c = await mk('em_conversa');
    await updateContact(db, c.id, { responded_at: now.toISOString(), follow_up_at: new Date(now.getTime() - 1000).toISOString() });
    await send(c.id);
    const after = (await getContact(db, c.id))!;
    expect(after.follow_up_at).toBeNull();
    expect(after.status).toBe('em_conversa');
  });

  it('follow-up futuro de quem respondeu continua', async () => {
    const c = await mk('em_conversa');
    const future = new Date(now.getTime() + day).toISOString();
    await updateContact(db, c.id, { responded_at: now.toISOString(), follow_up_at: future });
    await send(c.id);
    expect(new Date((await getContact(db, c.id))!.follow_up_at!).toISOString()).toBe(future);
  });

  it('eco do webhook já ligou a mensagem: continua com uma linha só', async () => {
    const c = await mk('novo');
    const provider = {
      sendText: async () => {
        await pg.query(`update messages set external_id = 'echo-1', status = 'enviada' where contact_id = $1`, [c.id]);
        return { externalId: 'echo-1' };
      },
    };
    const m = await send(c.id, provider);
    expect(m).toMatchObject({ status: 'enviada', external_id: 'echo-1' });
    expect(await listMessages(db, c.id)).toHaveLength(1);
    expect((await getContact(db, c.id))!.status).toBe('contatado');
  });

  it('eco prendeu o external_id a outra linha igual: sucesso, esta fica pendente, sem segunda linha', async () => {
    const c = await mk('novo');
    const provider = {
      sendText: async () => {
        await pg.query(
          `insert into messages (contact_id, direction, sent_from, kind, body, status, external_id) values ($1, 'saida', 'painel', 'texto', 'outra', 'enviada', 'echo-2')`,
          [c.id],
        );
        return { externalId: 'echo-2' };
      },
    };
    const m = await send(c.id, provider);
    expect(m.status).toBe('pendente');
    expect(await listMessages(db, c.id)).toHaveLength(2);
    expect((await getContact(db, c.id))!.status).toBe('contatado');
  });

  it('o mesmo clientMessageId não envia duas vezes', async () => {
    const c = await mk('novo');
    let calls = 0;
    const provider = { sendText: async () => ({ externalId: `e${++calls}-${n++}` }) };
    const input = { contactId: c.id, text: 'Oi', clientMessageId: `dup-${++n}` };
    const a = await sendMessage(db, provider, input, now);
    const b = await sendMessage(db, provider, input, now);
    expect(b.id).toBe(a.id);
    expect(calls).toBe(1);
  });
});

describe('retryMessage', () => {
  it('reenvia o texto como mensagem nova e deixa a antiga com erro', async () => {
    const c = await mk('novo');
    await expect(send(c.id, failing(), 'Texto X')).rejects.toThrow();
    const old = (await listMessages(db, c.id))[0]!;
    const again = await retryMessage(db, ok(), old.id, `r-${++n}`, now);
    expect(again.id).not.toBe(old.id);
    expect(again).toMatchObject({ body: 'Texto X', status: 'enviada' });
    const msgs = await listMessages(db, c.id);
    expect(msgs).toHaveLength(2);
    expect(msgs.find((m) => m.id === old.id)!.status).toBe('erro');
    expect((await getContact(db, c.id))!.status).toBe('contatado');
  });

  it('recusa mensagem que não está com erro', async () => {
    const c = await mk('novo');
    const m = await send(c.id);
    await expect(retryMessage(db, ok(), m.id, `r-${++n}`, now)).rejects.toThrow('com erro');
  });
});
