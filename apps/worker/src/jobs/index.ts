import { analyzeLeadJob } from './analyze-lead';
import { downloadMediaJob } from './download-media';
import { enrichLeadJob } from './enrich-lead';
import { extractAssetJob } from './extract-asset';
import { importHistoryJob } from './import-history';
import type { Handler } from './types';

export { JobFailure, Reschedule } from './types';

export const handlers: Record<string, Handler> = {
  analyze_lead: analyzeLeadJob,
  download_media: downloadMediaJob,
  enrich_lead: enrichLeadJob,
  extract_asset: extractAssetJob,
  import_history: importHistoryJob,
};
