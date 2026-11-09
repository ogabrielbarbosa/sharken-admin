// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/cron/retention/route';

describe('cron de retenção', () => {
  it('recusa sem o segredo', async () => {
    process.env.CRON_SECRET = 'certo';
    expect((await GET(new Request('https://x.test/c'))).status).toBe(401);
    expect((await GET(new Request('https://x.test/c', { headers: { authorization: 'Bearer errado' } }))).status).toBe(401);
  });
});
