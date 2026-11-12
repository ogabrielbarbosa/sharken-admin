import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppSendError, createEvolutionProvider, getWhatsAppProvider } from '../src/whatsapp';

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/evolution', `${name}.json`), 'utf8'));
const provider = createEvolutionProvider({ baseUrl: 'https://evo.test/', apiKey: 'k-test', instance: 'demo', fetch: vi.fn() });

describe('normalize', () => {
  it('texto recebido', () => {
    expect(provider.normalize(fx('text-inbound'))).toEqual([
      { kind: 'message', externalId: '3EB0A1B2C3D4E5F60001', phoneE164: '5519981342207', lid: null, pushName: 'Marcos', fromMe: false, text: 'Oi, tenho interesse', media: null, type: 'texto', meta: {}, at: new Date(1762876800 * 1000) },
    ]);
  });
  it('texto estendido', () => {
    expect(provider.normalize(fx('extended-text'))[0]).toMatchObject({ text: 'Quanto custa?' });
  });
  it('imagem com legenda preenche media e texto', () => {
    expect(provider.normalize(fx('image-caption'))[0]).toMatchObject({
      text: 'Nossa fachada',
      media: { kind: 'imagem', mime: 'image/jpeg', url: 'https://mmg.whatsapp.net/fake/image.enc', base64: '/9j/4AAQSkZJRgABAQ==' },
    });
  });
  it('mensagem enviada por mim', () => {
    expect(provider.normalize(fx('from-me'))[0]).toMatchObject({ fromMe: true, phoneE164: '5519981342207' });
  });
  it('ignora grupo, status e reação', () => {
    expect(provider.normalize(fx('group'))).toEqual([]);
    expect(provider.normalize(fx('status-broadcast'))).toEqual([]);
    expect(provider.normalize(fx('reaction'))).toEqual([]);
  });
  it('lid com telefone alternativo', () => {
    expect(provider.normalize(fx('lid'))[0]).toMatchObject({ phoneE164: '5519981342207', lid: '188888888888888' });
  });
  it('lid sem telefone', () => {
    expect(provider.normalize(fx('lid-only'))[0]).toMatchObject({ phoneE164: null, lid: '188888888888888' });
  });
  it('status das mensagens', () => {
    expect(provider.normalize(fx('update-read'))).toEqual([{ kind: 'status', externalId: '3EB0A1B2C3D4E5F60004', status: 'lida' }]);
    expect(provider.normalize(fx('update-delivered'))).toEqual([{ kind: 'status', externalId: '3EB0A1B2C3D4E5F60004', status: 'entregue' }]);
  });
  it('status numéricos, variantes e aninhado em update', () => {
    const upd = (data: object) => provider.normalize({ event: 'messages.update', data: { keyId: 'K1', ...data } });
    expect(upd({ status: 3 })).toEqual([{ kind: 'status', externalId: 'K1', status: 'entregue' }]);
    expect(upd({ status: 4 })).toEqual([{ kind: 'status', externalId: 'K1', status: 'lida' }]);
    expect(upd({ status: 'DELIVERED' })).toEqual([{ kind: 'status', externalId: 'K1', status: 'entregue' }]);
    expect(upd({ update: { status: 4 } })).toEqual([{ kind: 'status', externalId: 'K1', status: 'lida' }]);
    expect(upd({ status: 'PENDING' })).toEqual([]);
  });
  it('conexão', () => {
    expect(provider.normalize(fx('connection-open'))).toEqual([{ kind: 'connection', state: 'conectado', phone: null, profileName: null, statusReason: 200 }]);
    expect(provider.normalize(fx('connection-close'))[0]).toMatchObject({ kind: 'connection', state: 'desconectado' });
    expect(provider.normalize(fx('connection-connecting'))[0]).toMatchObject({ kind: 'connection', state: 'conectando' });
  });
  it('conexão aberta traz o número e o nome do perfil', () => {
    const raw = { event: 'connection.update', data: { state: 'open', wuid: '5519999990000@s.whatsapp.net', profileName: 'Sharken', statusReason: 200 } };
    expect(provider.normalize(raw)).toEqual([{ kind: 'connection', state: 'conectado', phone: '+5519999990000', profileName: 'Sharken', statusReason: 200 }]);
  });
  it('contato com foto (contacts.upsert e contacts.update)', () => {
    const raw = { event: 'contacts.upsert', data: [{ remoteJid: '5519981342207@s.whatsapp.net', pushName: 'Marcos', profilePicUrl: 'https://pps.whatsapp.net/v/x.jpg' }, { remoteJid: '1203@g.us', pushName: 'Grupo' }] };
    expect(provider.normalize(raw)).toEqual([{ kind: 'profile', phoneE164: '5519981342207', lid: null, pushName: 'Marcos', avatarUrl: 'https://pps.whatsapp.net/v/x.jpg' }]);
    expect(provider.normalize({ event: 'CONTACTS_UPDATE', data: { remoteJid: '99887766@lid', profilePicUrl: null } })).toEqual([{ kind: 'profile', phoneE164: null, lid: '99887766', pushName: null, avatarUrl: null }]);
  });
  it('aceita o nome do evento em maiúsculas e lixo', () => {
    expect(provider.normalize({ ...fx('connection-open'), event: 'CONNECTION_UPDATE' })).toHaveLength(1);
    expect(provider.normalize(null)).toEqual([]);
    expect(provider.normalize({ event: 'qrcode.updated', data: {} })).toEqual([]);
  });
});

describe('sendText', () => {
  const input = { phoneE164: '5519981342207', text: 'Olá', clientMessageId: 'c1' };
  it('envia com o header e o corpo certos', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx('send-ok')), { status: 201 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test/', apiKey: 'k-test', instance: 'demo', fetch: f });
    await expect(p.sendText(input)).resolves.toEqual({ externalId: '3EB0A1B2C3D4E5F6FFFF' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://evo.test/message/sendText/demo');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'k-test', 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ number: '5519981342207', text: 'Olá' });
  });
  it('número inexistente vira WhatsAppSendError com invalidNumber', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx('send-invalid-number')), { status: 400 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    const err = await p.sendText(input).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppSendError);
    expect(err.invalidNumber).toBe(true);
  });
  it('outro erro não marca invalidNumber', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"status":500}', { status: 500 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    const err = await p.sendText(input).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppSendError);
    expect(err.invalidNumber).toBe(false);
  });
  it('resposta sem id é erro', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    await expect(p.sendText(input)).rejects.toBeInstanceOf(WhatsAppSendError);
  });
});

describe('connectionQr', () => {
  it('devolve o QR em base64', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx('connect-qr')), { status: 200 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k-test', instance: 'demo', fetch: f });
    await expect(p.connectionQr()).resolves.toBe('data:image/png;base64,iVBORw0KGgoFAKE');
    expect(f.mock.calls[0][0]).toBe('https://evo.test/instance/connect/demo');
    expect(f.mock.calls[0][1].headers).toMatchObject({ apikey: 'k-test' });
  });
  it('já conectado devolve null', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fx('connect-open')), { status: 200 }));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    await expect(p.connectionQr()).resolves.toBeNull();
  });
});

describe('getWhatsAppProvider', () => {
  it('falha só no uso quando falta configuração', () => {
    expect(() => getWhatsAppProvider({})).toThrow(/EVOLUTION_URL/);
    expect(getWhatsAppProvider({ EVOLUTION_URL: 'https://e', EVOLUTION_API_KEY: 'k', EVOLUTION_INSTANCE: 'i' })).toBeDefined();
  });
});

describe('recentMessages', () => {
  const rec = (id: string, ts: number, jid = '5519981342207@s.whatsapp.net') => ({ key: { id, remoteJid: jid, fromMe: false }, pushName: 'Marcos', message: { conversation: id }, messageTimestamp: ts });
  const page = (records: object[]) => new Response(JSON.stringify({ messages: { records } }), { status: 200 });

  it('pagina da mais nova para a mais antiga, para no corte, ignora grupo e devolve em ordem cronológica', async () => {
    const full = Array.from({ length: 200 }, (_, i) => rec(`n${i}`, 2000 - i));
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(page(full))
      .mockResolvedValueOnce(page([rec('a', 1500), rec('g', 1400, '123@g.us'), rec('velha', 900)]));
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: fetchFn });
    const out = await p.recentMessages(new Date(1000 * 1000));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(201);
    expect(out[0]).toMatchObject({ kind: 'message', externalId: 'a' });
    expect(out.at(-1)).toMatchObject({ kind: 'message', externalId: 'n0' });
    expect(JSON.parse(fetchFn.mock.calls[1]![1].body)).toMatchObject({ offset: 200, page: 2 });
  });
});

describe('reply', () => {
  const ok = () => vi.fn().mockImplementation(async () => new Response(JSON.stringify(fx('send-ok')), { status: 201 }));
  const quoted = { externalId: '3EB0QUOTED', fromMe: false, text: 'Quanto custa?' };

  it('sendText cita a mensagem com key e texto', async () => {
    const f = ok();
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    await p.sendText({ phoneE164: '5519981342207', text: 'R$ 500', clientMessageId: 'c1', quoted });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      number: '5519981342207',
      text: 'R$ 500',
      quoted: { key: { id: '3EB0QUOTED', remoteJid: '5519981342207@s.whatsapp.net', fromMe: false }, message: { conversation: 'Quanto custa?' } },
    });
  });

  it('sendMedia e áudio também levam a citação', async () => {
    const f = ok();
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    await p.sendMedia({ phoneE164: '5519981342207', media: { kind: 'imagem', mime: 'image/png', base64: 'AAA', fileName: 'a.png' }, caption: 'olha', quoted: { ...quoted, fromMe: true } });
    await p.sendMedia({ phoneE164: '5519981342207', media: { kind: 'audio', mime: 'audio/ogg', base64: 'BBB', fileName: 'a.ogg' }, caption: null, quoted });
    expect(JSON.parse(f.mock.calls[0][1].body).quoted).toEqual({ key: { id: '3EB0QUOTED', remoteJid: '5519981342207@s.whatsapp.net', fromMe: true }, message: { conversation: 'Quanto custa?' } });
    expect(JSON.parse(f.mock.calls[1][1].body).quoted.key.id).toBe('3EB0QUOTED');
  });

  it('sem citação o corpo não muda', async () => {
    const f = ok();
    const p = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo', fetch: f });
    await p.sendText({ phoneE164: '5519981342207', text: 'Oi', clientMessageId: 'c1', quoted: null });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ number: '5519981342207', text: 'Oi' });
  });

  const provider = createEvolutionProvider({ baseUrl: 'https://evo.test', apiKey: 'k', instance: 'demo' });
  const upsert = (data: object) => ({ event: 'messages.upsert', data: { key: { remoteJid: '5519981342207@s.whatsapp.net', fromMe: false, id: 'NEW1' }, messageTimestamp: 1762771000, ...data } });

  it('lê a citação do contextInfo no nível da mensagem (formato normalizado da Evolution)', () => {
    const [e] = provider.normalize(upsert({ message: { conversation: 'Pode mandar de novo?' }, contextInfo: { stanzaId: '3EB0ORIG', quotedMessage: { conversation: 'Segue a página' } } }));
    expect(e).toMatchObject({ kind: 'message', text: 'Pode mandar de novo?', quoted: { externalId: '3EB0ORIG', text: 'Segue a página' } });
  });

  it('lê a citação de dentro do extendedTextMessage e de mídia citada', () => {
    const [a] = provider.normalize(upsert({ message: { extendedTextMessage: { text: 'Essa?', contextInfo: { stanzaId: 'Q2', quotedMessage: { imageMessage: { caption: 'cardápio' } } } } } }));
    expect(a).toMatchObject({ text: 'Essa?', quoted: { externalId: 'Q2', text: 'cardápio' } });
    const [b] = provider.normalize(upsert({ message: { imageMessage: { mimetype: 'image/jpeg', contextInfo: { stanzaId: 'Q3', quotedMessage: { audioMessage: {} } } } } }));
    expect(b).toMatchObject({ quoted: { externalId: 'Q3', text: '🎤 Áudio' } });
  });

  it('mensagem sem citação não ganha o campo', () => {
    const [e] = provider.normalize(upsert({ message: { conversation: 'Oi' } }));
    expect(e).not.toHaveProperty('quoted');
  });
});
