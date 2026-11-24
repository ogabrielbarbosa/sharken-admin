import { INSTAGRAM_MEDIA_JOB, REFRESH_LEAD_JOB } from '@lps/db';
import { analyzeLeadJob } from './analyze-lead';
import { downloadMediaJob } from './download-media';
import { enrichLeadJob } from './enrich-lead';
import { extractAssetJob } from './extract-asset';
import { importHistoryJob } from './import-history';
import { refreshLeadJob } from './refresh-lead';
import { instagramMediaJob } from './instagram-media';
import type { Handler } from './types';

export { JobFailure, Reschedule } from './types';

export const handlers: Record<string, Handler> = {
  analyze_lead: analyzeLeadJob,
  download_media: downloadMediaJob,
  enrich_lead: enrichLeadJob,
  extract_asset: extractAssetJob,
  import_history: importHistoryJob,
  [REFRESH_LEAD_JOB]: refreshLeadJob,
  [INSTAGRAM_MEDIA_JOB]: instagramMediaJob,
};
