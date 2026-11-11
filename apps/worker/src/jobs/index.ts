import { analyzeLeadJob } from './analyze-lead';
import { buildPageJob } from './build-page';
import { extractAssetJob } from './extract-asset';
import { generatePageJob } from './generate-page';
import { renderVideoJob } from './render-video';
import { transcodeVideoJob } from './transcode-video';
import type { Handler } from './types';

export { JobFailure, Reschedule } from './types';

export const handlers: Record<string, Handler> = {
  analyze_lead: analyzeLeadJob,
  build_page: buildPageJob,
  extract_asset: extractAssetJob,
  generate_page: generatePageJob,
  render_video: renderVideoJob,
  transcode_video: transcodeVideoJob,
};
