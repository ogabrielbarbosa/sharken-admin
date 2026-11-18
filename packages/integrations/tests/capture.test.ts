import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@lps/domain';

const db = vi.hoisted(() => ({
  tokens: {} as Record<string, string | null>,
  batches: [] as Partial<Batch>[],
  updateBatch: vi.fn(async () => undefined),
}));

vi.mock('@lps/config', () => ({
  getEnv: () => ({ APP_URL: 'https://admin.test', WEBHOOK_SECRET: 's' }),
  webhookBaseUrl: () => 'https://admin.test',
}));

vi.mock('@lps/db', () => ({
  createAdminClient: () => ({}),
  scopeDb: () => ({}),
  workspaceOfRow: async (_db: unknown, _t: string, id: string) => db.batches.find((b) => b.id === id)?.workspace_id ?? null,
  getBatch: async (_db: unknown, id: string) => db.batches.find((b) => b.id === id) ?? null,
  listBatches: async () => db.batches,
  getApifyToken: async (_db: unknown, ws: string) => db.tokens[ws] ?? null,
  updateBatch: db.updateBatch,
  listLeads: async () => [],
  importLeads: async () => undefined,
  listKnownPlaceIds: async () => new Set(),
  enqueueJob: async () => undefined,
  countJobs: async () => 0,
  updateLead: async () => undefined,
}));

import { APIFY_NOT_CONNECTED } from '../src/apify';
import { handleMapsResult, startMapsSearch, syncSearchProgress } from '../src/capture';

const batch = (id: string, ws: string, extra: Partial<Batch> = {}) =>
  ({ id, workspace_id: ws, location: 'Campinas, SP', business_type: 'pet shop', quantity: 5, status: 'buscando', apify_run_id: null, instagram_run_id: null, ...extra }) as Batch;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  db.tokens = {};
  db.batches = [];
  db.updateBatch.mockClear();
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    const body = u.includes('/actor-runs/') ? { data: { status: 'RUNNING', defaultDatasetId: 'ds1' } } : u.includes('/acts/') ? { data: { id: 'run1' } } : [];
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', fetchMock);
});

describe('captura com o token do workspace', () => {
  it('sem token: batch vai para erro e o Apify não é chamado', async () => {
    const b = batch('b1', 'wsA');
    db.batches = [b];
    await startMapsSearch(b);
    expect(db.updateBatch).toHaveBeenCalledWith(expect.anything(), 'b1', { status: 'erro', error: APIFY_NOT_CONNECTED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com token: a busca usa o token do workspace', async () => {
    const b = batch('b1', 'wsA');
    db.batches = [b];
    db.tokens.wsA = 't1';
    await startMapsSearch(b);
    expect(String(fetchMock.mock.calls[0][0])).toContain('token=t1');
  });

  it('retorno do Maps para workspace que tirou o token: erro sem exceção', async () => {
    db.batches = [batch('b1', 'wsA')];
    await expect(handleMapsResult('b1', { succeeded: true, datasetId: 'ds1' })).resolves.toBeUndefined();
    expect(db.updateBatch).toHaveBeenCalledWith(expect.anything(), 'b1', { status: 'erro', error: APIFY_NOT_CONNECTED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('progresso: batch sem token é pulado e os outros seguem', async () => {
    db.batches = [batch('a', 'wsA', { apify_run_id: 'ra' }), batch('b', 'wsB', { apify_run_id: 'rb' })];
    db.tokens.wsB = 'tb';
    await syncSearchProgress();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toContain('token=tb');
  });
});
