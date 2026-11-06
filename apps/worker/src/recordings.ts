import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Flow } from '@lps/domain';
import { ROOT_DIR } from './env';

const dirFor = (flow: Flow) => join(ROOT_DIR, 'assets/recordings', flow);

export const recordingPath = (flow: Flow, id: string) => join(dirFor(flow), `${id}.mp3`);

export function availableRecordings(flow: Flow): string[] {
  try {
    return readdirSync(dirFor(flow)).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, ''));
  } catch {
    return [];
  }
}
