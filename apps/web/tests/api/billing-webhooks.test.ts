// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as abacate } from '@/app/api/webhooks/abacatepay/[workspace]/route';
import { POST as asaas } from '@/app/api/webhooks/asaas/route';
import { POST as zapsign } from '@/app/api/webhooks/zapsign/route';

beforeEach(() => { process.env.WEBHOOK_SECRET = 'certo'; });
afterEach(() => { delete process.env.WEBHOOK_SECRET; });

describe('webhooks de cobrança e contrato', () => {
  it('Asaas recusa token errado', async () => {
    const res = await asaas(new Request('https://x.test/h', { method: 'POST', headers: { 'asaas-access-token': 'errado' }, body: '{}' }));
    expect(res.status).toBe(401);
  });
  it('Asaas ignora corpo sem pagamento', async () => {
    const res = await asaas(new Request('https://x.test/h', { method: 'POST', headers: { 'asaas-access-token': 'certo' }, body: '{}' }));
    expect(res.status).toBe(200);
  });
  it('AbacatePay recusa workspace inválido sem tocar no banco', async () => {
    const res = await abacate(new Request('https://x.test/h?webhookSecret=x', { method: 'POST', body: '{}' }), { params: Promise.resolve({ workspace: 'nao-e-uuid' }) });
    expect(res.status).toBe(401);
  });
  it('ZapSign recusa segredo errado', async () => {
    const res = await zapsign(new Request('https://x.test/h?secret=errado', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
  it('ZapSign ignora corpo sem documento', async () => {
    const res = await zapsign(new Request('https://x.test/h?secret=certo', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(200);
  });
});
