// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPublicPage: vi.fn() }));
vi.mock('@lps/db', () => ({ createAdminClient: () => ({}), getPublicPage: mocks.getPublicPage }));

const { GET } = await import('@/app/paginas-publicadas/[id]/route');

const get = (host: string, id = 'abcDEF2345') =>
  GET(new Request(`https://${host}/paginas-publicadas/${id}`, { headers: { host } }), { params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe('página publicada', () => {
  it('serve o HTML em sandbox, sem cache e sem indexar', async () => {
    mocks.getPublicPage.mockResolvedValue({ html: '<h1>Oi</h1>', expired: false });
    const res = await get('pages.sharkenapps.com');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>Oi</h1>');
    expect(res.headers.get('content-security-policy')).toMatch(/^sandbox /);
    expect(res.headers.get('content-security-policy')).not.toContain('allow-same-origin');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('expirada responde 410', async () => {
    mocks.getPublicPage.mockResolvedValue({ html: '', expired: true });
    const res = await get('pages.sharkenapps.com');
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('expirou');
  });

  it('inexistente responde 404', async () => {
    mocks.getPublicPage.mockResolvedValue(null);
    expect((await get('pages.sharkenapps.com')).status).toBe(404);
  });

  it('em outro host não serve nada', async () => {
    const res = await get('admin.sharkenapps.com');
    expect(res.status).toBe(404);
    expect(mocks.getPublicPage).not.toHaveBeenCalled();
  });
});
