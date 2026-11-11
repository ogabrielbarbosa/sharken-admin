// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingestEvent = vi.fn();
vi.mock('@lps/db', () => ({ createAdminClient: () => ({}), ingestEvent: (...a: unknown[]) => ingestEvent(...a) }));
vi.mock('@lps/integrations', () => ({
  getWhatsAppProvider: () => ({ normalize: (raw: { events?: unknown[] }) => raw.events ?? [] }),
}));

import { POST } from '@/app/api/webhooks/whatsapp/route';

const call = (body: string, token = 'certo') => POST(new Request(`https://x.test/api/webhooks/whatsapp?token=${token}`, { method: 'POST', body }));

beforeEach(() => { process.env.WHATSAPP_WEBHOOK_SECRET = 'certo'; ingestEvent.mockReset(); });
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
    expect((await call(JSON.stringify({ events: [{ kind: 'message' }, { kind: 'message' }] }))).status).toBe(200);
  });
  it('falha em algum evento responde 500, depois de tentar todos', async () => {
    ingestEvent.mockRejectedValueOnce(new Error('banco caiu')).mockResolvedValue(undefined);
    const res = await call(JSON.stringify({ events: [{ kind: 'message' }, { kind: 'message' }] }));
    expect(res.status).toBe(500);
    expect(ingestEvent).toHaveBeenCalledTimes(2);
  });
});
