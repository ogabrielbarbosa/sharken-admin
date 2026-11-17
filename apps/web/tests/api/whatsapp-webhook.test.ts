// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingestEvent = vi.fn();
let active: string | null = 'atual';
// Cada instância pertence a um workspace; só `active` está ligada a um.
vi.mock('@lps/db', () => ({
  createAdminClient: () => ({}),
  scopeDb: (db: object) => db,
  workspaceByInstance: async (_db: unknown, instance: string) => (active && instance === active ? 'ws-1' : null),
  ingestEvent: (...a: unknown[]) => ingestEvent(...a),
}));
vi.mock('@lps/integrations', () => ({
  getWhatsAppProvider: () => ({ normalize: (raw: { events?: unknown[] }) => raw.events ?? [] }),
}));

import { POST } from '@/app/api/webhooks/whatsapp/route';

const call = (body: string, token = 'certo') => POST(new Request(`https://x.test/api/webhooks/whatsapp?token=${token}`, { method: 'POST', body }));

beforeEach(() => { process.env.WHATSAPP_WEBHOOK_SECRET = 'certo'; ingestEvent.mockReset(); active = 'atual'; });
afterEach(() => { delete process.env.WHATSAPP_WEBHOOK_SECRET; });

describe('webhook do WhatsApp', () => {
  it('recusa token errado com 401', async () => {
    expect((await call('{}', 'errado')).status).toBe(401);
  });
  it('JSON inválido responde 200', async () => {
    expect((await call('{nope')).status).toBe(200);
  });
  it('sem eventos responde 200', async () => {
    expect((await call('{}')).status).toBe(200);
  });
  it('eventos ingeridos respondem 200', async () => {
    ingestEvent.mockResolvedValue(undefined);
    expect((await call(JSON.stringify({ instance: 'atual', events: [{ kind: 'message' }, { kind: 'message' }] }))).status).toBe(200);
  });
  it('ignora instância que não pertence a nenhum workspace', async () => {
    active = null;
    ingestEvent.mockResolvedValue(undefined);
    expect((await call(JSON.stringify({ instance: 'prospeccao', events: [{ kind: 'message' }, { kind: 'connection' }] }))).status).toBe(200);
    expect(ingestEvent).not.toHaveBeenCalled();
  });
  it('ignora eventos sem instância identificada', async () => {
    ingestEvent.mockResolvedValue(undefined);
    await call(JSON.stringify({ events: [{ kind: 'message' }] }));
    expect(ingestEvent).not.toHaveBeenCalled();
  });
  it('ignora eventos de outra instância', async () => {
    ingestEvent.mockResolvedValue(undefined);
    expect((await call(JSON.stringify({ instance: 'antiga', events: [{ kind: 'message' }] }))).status).toBe(200);
    expect(ingestEvent).not.toHaveBeenCalled();
  });
  it('aceita eventos da instância em uso', async () => {
    ingestEvent.mockResolvedValue(undefined);
    await call(JSON.stringify({ instance: 'atual', events: [{ kind: 'message' }] }));
    expect(ingestEvent).toHaveBeenCalledTimes(1);
  });
  it('falha em algum evento responde 500, depois de tentar todos', async () => {
    ingestEvent.mockRejectedValueOnce(new Error('banco caiu')).mockResolvedValue(undefined);
    const res = await call(JSON.stringify({ instance: 'atual', events: [{ kind: 'message' }, { kind: 'message' }] }));
    expect(res.status).toBe(500);
    expect(ingestEvent).toHaveBeenCalledTimes(2);
  });
});
