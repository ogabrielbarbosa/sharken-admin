// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/webhooks/apify/route';

afterEach(() => { delete process.env.WEBHOOK_SECRET; });

describe('webhook do Apify', () => {
  it('recusa segredo errado com 401', async () => {
    process.env.WEBHOOK_SECRET = 'certo';
    const res = await POST(new Request('https://x.test/api/webhooks/apify?secret=errado&batch=b&kind=maps', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('recusa quando o segredo não está configurado', async () => {
    const res = await POST(new Request('https://x.test/api/webhooks/apify?secret=&batch=b&kind=maps', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
});
