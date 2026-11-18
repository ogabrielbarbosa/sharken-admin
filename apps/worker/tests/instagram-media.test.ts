import { describe, expect, it, vi } from 'vitest';
import type { Db, Job } from '@lps/db';

vi.mock('@lps/db', () => ({
  createAdminClient: () => ({}),
  getLead: async () => ({ id: 'l1', instagram_url: 'https://instagram.com/petlegal', instagram_media: null }),
  getApifyToken: async () => null,
  updateLead: async () => undefined,
}));

vi.mock('@lps/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lps/integrations')>()),
  r2Config: () => ({ accountId: 'a', accessKeyId: 'k', secretAccessKey: 's', bucket: 'b', publicUrl: 'https://img.test' }),
}));

import { APIFY_NOT_CONNECTED } from '@lps/integrations';
import { instagramMediaJob } from '../src/jobs/instagram-media';
import { JobFailure } from '../src/jobs/types';

describe('instagramMediaJob', () => {
  it('sem token do Apify: falha definitiva com o aviso de conectar', async () => {
    const job = { id: 'j1', type: 'instagram_media', workspace_id: 'wsA', payload: { lead_id: 'l1' } } as unknown as Job;
    const run = instagramMediaJob({} as Db, job);
    await expect(run).rejects.toBeInstanceOf(JobFailure);
    await expect(instagramMediaJob({} as Db, job)).rejects.toThrow(APIFY_NOT_CONNECTED);
  });
});
