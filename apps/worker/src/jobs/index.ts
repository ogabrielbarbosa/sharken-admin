import { analyzeLeadJob } from './analyze-lead';
import type { Handler } from './types';

export { JobFailure, Reschedule } from './types';

export const handlers: Record<string, Handler> = {
  analyze_lead: analyzeLeadJob,
};
