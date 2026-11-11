import { analyzeLeadJob } from './analyze-lead';
import { downloadMediaJob } from './download-media';
import { extractAssetJob } from './extract-asset';
import type { Handler } from './types';

export { JobFailure, Reschedule } from './types';

export const handlers: Record<string, Handler> = {
  analyze_lead: analyzeLeadJob,
  download_media: downloadMediaJob,
  extract_asset: extractAssetJob,
};
