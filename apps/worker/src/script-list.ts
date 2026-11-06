import { SCRIPTS, VIDEO_ENABLED, VOICE_MODE } from '@lps/config';
import { findMissingRecordings, parseScript, type Flow } from '@lps/domain';
import { availableRecordings, recordingPath } from './recordings';

for (const flow of Object.keys(SCRIPTS) as Flow[]) {
  const segments = parseScript(SCRIPTS[flow]);
  const missing = findMissingRecordings(segments, availableRecordings(flow));
  const fixed = segments.filter((s) => s.kind === 'fixed');
  console.log(`\n${flow} — vídeo ${VIDEO_ENABLED[flow] ? 'ligado' : 'desligado'}, voz: ${VOICE_MODE[flow]}`);
  console.log(`${fixed.length - missing.length} de ${fixed.length} trechos gravados`);
  for (const segment of missing) {
    console.log(`\nGrave em ${recordingPath(flow, segment.id)}:\n  "${segment.text}"`);
  }
}
