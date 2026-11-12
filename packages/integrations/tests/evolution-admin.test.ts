import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_EVENTS, createEvolutionAdmin, getEvolutionAdmin, normalizeInstanceName } from '../src/whatsapp';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

describe('normalizeInstanceName', () => {
  it('vira minúsculas, sem acento e com hífen', () => {
    expect(normalizeInstanceName('  Prospecção Campinas! ')).toBe('prospeccao-campinas');
    expect(normalizeInstanceName('!!!')).toBe('');
  });
});

describe('getEvolutionAdmin', () => {
  const env = { EVOLUTION_URL: 'https://e', EVOLUTION_API_KEY: 'k' };
  it('sem servidor devolve null', () => expect(getEvolutionAdmin('x', {})).toBeNull());
  it('usa a instância do banco antes da variável', () => {
    expect(getEvolutionAdmin('banco', { ...env, EVOLUTION_INSTANCE: 'env' })?.instanceName).toBe('banco');
    expect(getEvolutionAdmin(null, { ...env, EVOLUTION_INSTANCE: 'env' })?.instanceName).toBe('env');
    expect(getEvolutionAdmin(null, env)?.instanceName).toBe('');
  });
});

describe('ensureWebhook', () => {
  const url = 'https://app/api/webhooks/whatsapp?token=t';
  it('não registra de novo quando já está igual', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ url, enabled: true, events: [...WEBHOOK_EVENTS] }));
    const admin = createEvolutionAdmin({ baseUrl: 'https://e', apiKey: 'k', instance: 'p', fetch });
    expect(await admin.ensureWebhook(url)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('registra quando a URL mudou', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ url: 'https://velho', enabled: true, events: [...WEBHOOK_EVENTS] })).mockResolvedValueOnce(json({}));
    const admin = createEvolutionAdmin({ baseUrl: 'https://e', apiKey: 'k', instance: 'p', fetch });
    expect(await admin.ensureWebhook(url)).toBe(true);
    const [endpoint, init] = fetch.mock.calls[1]!;
    expect(endpoint).toBe('https://e/webhook/set/p');
    expect(JSON.parse(init.body).webhook.url).toBe(url);
  });
});

describe('provedor sem instância', () => {
  it('normaliza o webhook, mas não envia', async () => {
    const { getWhatsAppProvider } = await import('../src/whatsapp');
    const p = getWhatsAppProvider({ EVOLUTION_URL: 'https://e', EVOLUTION_API_KEY: 'k' });
    expect(p.normalize({})).toEqual([]);
    await expect(p.connectionQr()).rejects.toThrow(/instância/);
  });
});
