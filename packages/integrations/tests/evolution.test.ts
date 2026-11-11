import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppSendError, createEvolutionProvider, getWhatsAppProvider } from '../src/whatsapp';

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/evolution', `${name}.json`), 'utf8'));
const provider = createEvolutionProvider({ baseUrl: 'https://evo.test/', apiKey: 'k-test', instance: 'demo', fetch: vi.fn() });

describe('normalize', () => {
  it('texto recebido', () => {
    expect(provider.normalize(fx('text-inbound'))).toEqual([
      { kind: 'message', externalId: '3EB0A1B2C3D4E5F60001', phoneE164: '+5519981342207', lid: null, pushName: 'Marcos', fromMe: false, text: 'Oi, tenho interesse', media: null, at: new Date(1762876800 * 1000) },
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
    expect(provider.normalize(fx('from-me'))[0]).toMatchObject({ fromMe: true, phoneE164: '+5519981342207' });
  });
  it('ignora grupo, status e reação', () => {
    expect(provider.normalize(fx('group'))).toEqual([]);
    expect(provider.normalize(fx('status-broadcast'))).toEqual([]);
    expect(provider.normalize(fx('reaction'))).toEqual([]);
  });
  it('lid com telefone alternativo', () => {
    expect(provider.normalize(fx('lid'))[0]).toMatchObject({ phoneE164: '+5519981342207', lid: '188888888888888' });
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
    expect(provider.normalize(fx('connection-open'))).toEqual([{ kind: 'connection', state: 'conectado' }]);
    expect(provider.normalize(fx('connection-close'))).toEqual([{ kind: 'connection', state: 'desconectado' }]);
    expect(provider.normalize(fx('connection-connecting'))).toEqual([{ kind: 'connection', state: 'conectando' }]);
  });
  it('aceita o nome do evento em maiúsculas e lixo', () => {
    expect(provider.normalize({ ...fx('connection-open'), event: 'CONNECTION_UPDATE' })).toHaveLength(1);
    expect(provider.normalize(null)).toEqual([]);
    expect(provider.normalize({ event: 'qrcode.updated', data: {} })).toEqual([]);
  });
});

describe('sendText', () => {
  const input = { phoneE164: '+5519981342207', text: 'Olá', clientMessageId: 'c1' };
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
