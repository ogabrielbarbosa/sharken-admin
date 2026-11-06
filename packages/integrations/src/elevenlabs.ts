import { createHash } from 'node:crypto';
import { requireOptional } from '@lps/config';
import type { Db } from '@lps/db';
import { BUCKET, uploadMedia } from './storage';

const MODEL = 'eleven_multilingual_v2';

async function synthesize(text: string): Promise<Buffer> {
  const voice = requireOptional('ELEVENLABS_VOICE_ID');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': requireOptional('ELEVENLABS_API_KEY'), 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL }),
  });
  if (!res.ok) throw new Error(`O ElevenLabs respondeu ${res.status}.`);
  return Buffer.from(await res.arrayBuffer());
}

/** Gera a fala com a voz clonada. O mesmo texto reaproveita o áudio já salvo. */
export async function synthesizeSlot(db: Db, text: string): Promise<Buffer> {
  const path = `voice/${createHash('sha256').update(text).digest('hex')}.mp3`;
  const cached = await db.storage.from(BUCKET).download(path);
  if (cached.data) return Buffer.from(await cached.data.arrayBuffer());
  const audio = await synthesize(text);
  await uploadMedia(db, path, audio, 'audio/mpeg');
  return audio;
}
