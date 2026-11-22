import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Batch } from '@lps/domain';

const db = vi.hoisted(() => ({
  tokens: {} as Record<string, string | null>,
  batches: [] as Partial<Batch>[],
  updateBatch: vi.fn(async () => undefined),
  enqueueJob: vi.fn(async () => undefined),
  pending: [] as { id: string; instagram_url: string | null }[],
  known: [] as { id: string; batch_id: string; instagram_handle: string }[],
  linkExistingLeads: vi.fn(async () => undefined),
  importLeads: vi.fn(async () => undefined),
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
  listLeads: async () => db.pending,
  importLeads: db.importLeads,
  batchLocations: (b: Batch) => (b.locations?.length ? b.locations : [b.location]),
  leadsByInstagramHandles: async (_db: unknown, handles: string[]) => db.known.filter((l) => handles.includes(l.instagram_handle)),
  linkExistingLeads: db.linkExistingLeads,
  listKnownPlaceIds: async () => new Set(),
  enqueueJob: db.enqueueJob,
  countJobs: async () => 0,
  updateLead: async () => undefined,
}));

import { APIFY_NOT_CONNECTED } from '../src/apify';
import { handleGoogleResult, handleMapsResult, handleProfilesResult, startInstagramSearch, startMapsSearch, syncSearchProgress } from '../src/capture';

const batch = (id: string, ws: string, extra: Partial<Batch> = {}) =>
  ({ id, workspace_id: ws, location: 'Campinas, SP', business_type: 'pet shop', quantity: 5, status: 'buscando', apify_run_id: null, instagram_run_id: null, ...extra }) as Batch;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  db.tokens = {};
  db.batches = [];
  db.updateBatch.mockClear();
  db.enqueueJob.mockClear();
  db.pending = [];
  db.known = [];
  db.linkExistingLeads.mockClear();
  db.importLeads.mockClear();
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

  it('webhook repetido sem token não estraga batch que já seguiu', async () => {
    db.batches = [batch('b1', 'wsA', { status: 'concluido', instagram_run_id: 'ri' }), batch('b2', 'wsA', { status: 'concluido' })];
    await handleMapsResult('b1', { succeeded: true, datasetId: 'ds1' });
    await handleMapsResult('b2', { succeeded: true, datasetId: 'ds1' });
    expect(db.updateBatch).not.toHaveBeenCalled();
  });

  it('sem token: os leads já importados seguem para a análise', async () => {
    db.batches = [batch('b1', 'wsA')];
    db.pending = [{ id: 'l1', instagram_url: null }];
    await handleMapsResult('b1', { succeeded: true, datasetId: 'ds1' });
    expect(db.enqueueJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'analyze_lead', payload: { lead_id: 'l1', batch_id: 'b1' } }));
  });

  it('progresso: batch sem token é pulado e os outros seguem', async () => {
    db.batches = [batch('a', 'wsA', { apify_run_id: 'ra' }), batch('b', 'wsB', { apify_run_id: 'rb' })];
    db.tokens.wsB = 'tb';
    await syncSearchProgress();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toContain('token=tb');
  });
});

describe('busca do Instagram pelo Google', () => {
  const ig = (extra: Partial<Batch> = {}) => batch('b2', 'wsA', {
    source: 'instagram', locations: ['São José dos Campos, SP'], niche_terms: ['lentes dentais', 'facetas'], location_terms: ['são josé dos campos', 'sjc'],
    google_run_id: null, profiles_run_id: null, ...extra,
  });

  it('roda a busca no Google com a consulta montada', async () => {
    db.batches = [ig()];
    db.tokens.wsA = 't1';
    await startInstagramSearch(db.batches[0] as Batch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('apify~google-search-scraper');
    expect(JSON.parse((init as RequestInit).body as string).queries).toBe('site:instagram.com ("lentes dentais" OR "facetas") ("são josé dos campos" OR "sjc") -inurl:/p/ -inurl:/reel/ -inurl:/reels/ -inurl:/explore/ -inurl:/tv/ -inurl:/stories/');
    expect(db.updateBatch).toHaveBeenCalledWith(expect.anything(), 'b2', expect.objectContaining({ google_run_id: 'run1', status: 'buscando' }));
  });

  it('perfil conhecido entra direto; os novos vão para a leitura dos perfis', async () => {
    db.batches = [ig({ google_run_id: 'g1' })];
    db.tokens.wsA = 't1';
    db.known = [{ id: 'L1', batch_id: 'b0', instagram_handle: 'clinica.a' }];
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/datasets/')) return new Response(JSON.stringify([{ organicResults: [{ url: 'https://www.instagram.com/clinica.a/' }, { url: 'https://www.instagram.com/p/x/' }, { url: 'https://www.instagram.com/clinica.b/' }] }]));
      return new Response(JSON.stringify({ data: { id: 'run2' } }));
    });
    await handleGoogleResult('b2', { succeeded: true, datasetId: 'ds' });
    expect(db.linkExistingLeads).toHaveBeenCalledWith(expect.anything(), 'b2', [db.known[0]]);
    const run = fetchMock.mock.calls.find((c) => String(c[0]).includes('instagram-profile-scraper'))!;
    expect(JSON.parse((run[1] as RequestInit).body as string)).toEqual({ usernames: ['clinica.b'] });
    expect(db.updateBatch).toHaveBeenCalledWith(expect.anything(), 'b2', { profiles_run_id: 'run2', status: 'buscando' });
  });

  it('perfis lidos viram leads com a cidade da bio', async () => {
    db.batches = [ig({ locations: ['São José dos Campos, SP', 'Jacareí, SP'], profiles_run_id: 'p1' })];
    db.tokens.wsA = 't1';
    fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ username: 'clinica.b', fullName: 'Clínica B', biography: 'Lentes em Jacareí · (12) 99876-5432' }])));
    await handleProfilesResult('b2', { datasetId: 'ds' });
    expect(db.importLeads).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ name: 'Clínica B', city: 'Jacareí', phone_e164: '5512998765432', place_id: null })]);
  });
});
