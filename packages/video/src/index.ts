import { fileURLToPath } from 'node:url';

export type { NarrationClip, ProposalVideoProps } from './ProposalVideo';
export const VIDEO_ENTRY = fileURLToPath(new URL('./entry.ts', import.meta.url));
export const COMPOSITION_ID = 'ProposalVideo';
export const VIDEO_FPS = 30;
