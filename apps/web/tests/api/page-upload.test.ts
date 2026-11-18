// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ publishPage: vi.fn(), existing: null as null | { id: string } }));

vi.mock('@lps/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@lps/db')>();
  const select = () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.existing, error: null }) }) });
  return {
    ...real,
    createAdminClient: () => ({}),
    scopeDb: () => ({ from: () => ({ select }) }),
    publishPage: mocks.publishPage,
  };
});

vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'segredo');
const { PUT } = await import('@/app/api/pages/upload/route');
const { signUpload, verifyUpload, UPLOAD_TTL_MS } = await import('@/lib/page-upload');

const LEAD = '11111111-1111-4111-8111-111111111111';
const grant = { l: LEAD, w: 'w1', u: 'u1', p: 'abcDEF2345', n: true, t: 'Padaria', e: null };
const put = (token: string | null, body: string) =>
  PUT(new Request(`https://admin.test/api/pages/upload${token ? `?token=${token}` : ''}`, { method: 'PUT', body }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = null;
  mocks.publishPage.mockImplementation(async (_db, o) => ({
    page: { id: o.pageId ?? o.newId, expires_at: null },
    url: `https://pages.sharkenapps.com/${o.pageId ?? o.newId}`,
  }));
});

describe('token de upload', () => {
  it('assinatura alterada ou vencida é recusada', () => {
    const token = signUpload(grant);
    expect(verifyUpload(token)).toMatchObject(grant);
    const [body, mac] = token.split('.');
    const other = Buffer.from(JSON.stringify({ ...grant, w: 'w2', x: Date.now() + 60_000 })).toString('base64url');
    expect(verifyUpload(`${other}.${mac}`)).toBeNull();
    expect(verifyUpload(`${body}.${mac}x`)).toBeNull();
    expect(verifyUpload(token, Date.now() + UPLOAD_TTL_MS + 1)).toBeNull();
    expect(verifyUpload(null)).toBeNull();
  });
});

describe('PUT /api/pages/upload', () => {
  it('sem token válido responde 401 e não publica', async () => {
    const res = await put('lixo.lixo', '<h1>oi</h1>');
    expect(res.status).toBe(401);
    expect(mocks.publishPage).not.toHaveBeenCalled();
  });

  it('primeiro envio cria a página com o id reservado', async () => {
    const html = '<!DOCTYPE html><h1>oi</h1>'.padEnd(250_000, ' ');
    const res = await put(signUpload(grant), html);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: 'https://pages.sharkenapps.com/abcDEF2345', caracteres: 250_000 });
    expect(mocks.publishPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      leadId: LEAD, html, title: 'Padaria', newId: 'abcDEF2345', expiresInHours: null, userId: 'u1',
    }));
  });

  it('reenviar com o mesmo link troca o HTML da mesma página', async () => {
    mocks.existing = { id: 'abcDEF2345' };
    await put(signUpload(grant), '<h1>v2</h1>');
    const o = mocks.publishPage.mock.calls[0][1];
    expect(o.pageId).toBe('abcDEF2345');
    expect(o.newId).toBeUndefined();
    expect(o.expiresInHours).toBeUndefined();
  });

  it('arquivo vazio responde 400', async () => {
    const res = await put(signUpload(grant), '   ');
    expect(res.status).toBe(400);
    expect(mocks.publishPage).not.toHaveBeenCalled();
  });

  it('lead que sumiu responde 404', async () => {
    mocks.publishPage.mockRejectedValue(new Error('Lead não encontrado.'));
    const res = await put(signUpload(grant), '<h1>oi</h1>');
    expect(res.status).toBe(404);
  });
});
