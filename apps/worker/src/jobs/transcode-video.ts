import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { getLead, getVideo, logEvent, saveVideo } from '@lps/db';
import { uploadMedia } from '@lps/integrations';
import { JobFailure, type Handler } from './types';

const run = promisify(execFile);
const ORIGINALS = 'videos-originais';
const brew = (bin: string) => (existsSync(`/opt/homebrew/bin/${bin}`) ? `/opt/homebrew/bin/${bin}` : bin);
const FFMPEG = process.env.FFMPEG_PATH ?? brew('ffmpeg');
const FFPROBE = process.env.FFPROBE_PATH ?? brew('ffprobe');

/** Argumentos do ffmpeg: H.264 até 1080p, áudio AAC, pronto para tocar antes de baixar tudo. */
export function ffmpegArgs(input: string, output: string): string[] {
  return [
    '-y', '-i', input,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-vf', "scale='min(1920,iw)':-2",
    '-c:a', 'aac',
    '-movflags', '+faststart',
    output,
  ];
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new JobFailure('Não consegui ler a duração do vídeo.');
  return Math.round(seconds * 10) / 10;
}

export const transcodeVideoJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  const video = lead ? await getVideo(db, lead.id) : null;
  if (!lead || !video?.original_path) return;

  const dir = await mkdtemp(join(tmpdir(), 'lps-transcode-'));
  try {
    await saveVideo(db, lead.id, { status: 'convertendo', progress: 0, error: null });
    const { data, error } = await db.storage.from(ORIGINALS).createSignedUrl(video.original_path, 3600);
    if (error || !data) throw new JobFailure('Não encontrei o arquivo enviado. Envie o vídeo de novo.');
    const res = await fetch(data.signedUrl);
    if (!res.ok || !res.body) throw new JobFailure('Não consegui baixar o arquivo enviado. Envie o vídeo de novo.');

    const input = join(dir, `entrada${extname(video.original_path).toLowerCase() || '.mp4'}`);
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(input));

    const output = join(dir, 'saida.mp4');
    try {
      await run(FFMPEG, ffmpegArgs(input, output), { maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
      throw new JobFailure(`Não consegui converter o vídeo. Confira se o arquivo é um vídeo válido. (${(e as Error).message.split('\n')[0]})`);
    }
    const seconds = await probeDuration(output);

    const storagePath = `videos/${lead.id}/${randomUUID().slice(0, 8)}.mp4`;
    await uploadMedia(db, storagePath, await readFile(output), 'video/mp4');
    const previous = video.storage_path;
    await saveVideo(db, lead.id, { source: 'gravado', status: 'pronto', progress: 100, storage_path: storagePath, duration_seconds: seconds, error: null });
    await logEvent(db, lead.id, 'video_convertido', { seconds });
    // O vídeo antigo (troca de arquivo) deixa de ser usado.
    if (previous && previous !== storagePath && previous.startsWith('videos/')) await db.storage.from('media').remove([previous]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

// Os originais ficam no bucket `videos-originais`; apagar depois de 7 dias é um passo futuro (fora desta tarefa).
transcodeVideoJob.onFailure = async (db, job, message) => {
  await saveVideo(db, job.payload.lead_id, { status: 'erro', error: message });
  await logEvent(db, job.payload.lead_id, 'erro_video', { message });
};
