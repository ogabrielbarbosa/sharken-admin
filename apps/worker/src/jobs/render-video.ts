import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnv, SCRIPTS, VOICE_MODE } from '@lps/config';
import { getLead, getSite, logEvent, moveLead, saveSite, saveVideo, updateLead, type Db } from '@lps/db';
import { buildTimeline, findMissingRecordings, parseScript, renderScript, resolveSlotText, type Flow, type Lead, type ScriptVars } from '@lps/domain';
import { synthesizeSlot, uploadMedia } from '@lps/integrations';
import { VIDEO_FPS } from '@lps/video';
import { parseFile } from 'music-metadata';
import { recordPage } from '../record-page';
import { availableRecordings, recordingPath } from '../recordings';
import { renderProposal } from '../render';
import { serveDir } from '../static-server';
import { JobFailure, type Handler } from './types';

const BEFORE_SITE_SECONDS = 8;

async function buildNarration(db: Db, lead: Lead, flow: Flow, vars: ScriptVars, dir: string): Promise<string[]> {
  const script = SCRIPTS[flow];
  if (VOICE_MODE[flow] === 'clone_total') {
    await writeFile(join(dir, 'audio-0.mp3'), await synthesizeSlot(db, renderScript(script, vars)));
    return ['audio-0.mp3'];
  }
  const segments = parseScript(script);
  const missing = findMissingRecordings(segments, availableRecordings(flow));
  if (missing.length) throw new JobFailure(`Trecho sem áudio gravado: "${missing[0].text.slice(0, 60)}". Rode pnpm script:list.`);
  const files: string[] = [];
  for (const [i, segment] of segments.entries()) {
    const name = `audio-${i}.mp3`;
    if (segment.kind === 'fixed') await copyFile(recordingPath(flow, segment.id), join(dir, name));
    else await writeFile(join(dir, name), await synthesizeSlot(db, resolveSlotText(segment.slot, vars)));
    files.push(name);
  }
  return files;
}

export const renderVideoJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  if (!lead || lead.stage !== 'gerando_material') return;
  const site = await getSite(db, lead.id);
  if (!site) throw new JobFailure('A página ainda não foi gerada.');

  const flow = lead.flow ?? 'sem_site';
  const dir = join(tmpdir(), `lps-video-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  await saveVideo(db, lead.id, { status: 'renderizando', progress: 0, error: null });

  const server = await serveDir(dir);
  try {
    const vars: ScriptVars = { nome: lead.name, cidade: lead.city ?? 'sua região', tipo: lead.business_type ?? 'negócios', motivo: lead.reason ?? '' };
    const audioFiles = await buildNarration(db, lead, flow, vars, dir);
    const durations = await Promise.all(audioFiles.map(async (f) => (await parseFile(join(dir, f))).format.duration ?? 0));
    const timeline = buildTimeline(durations.map((durationSeconds) => ({ durationSeconds })), VIDEO_FPS);
    const totalFrames = timeline.reduce((sum, t) => sum + t.durationInFrames, 0);
    const totalSeconds = totalFrames / VIDEO_FPS;

    let beforeSeconds = 0;
    let beforeSiteSrc: string | undefined;
    if (flow === 'melhorar_site' && lead.website_url) {
      try {
        await recordPage(lead.website_url, BEFORE_SITE_SECONDS, dir, 'antes.webm');
        beforeSeconds = BEFORE_SITE_SECONDS;
        beforeSiteSrc = server.url('antes.webm');
      } catch {
        // Sem a gravação do site atual, o vídeo começa direto na página nova.
      }
    }

    const env = getEnv();
    const pageUrl = new URL(`/p/${site.slug}`, env.APP_URL);
    pageUrl.searchParams.set('captura', env.CAPTURE_TOKEN);
    await recordPage(pageUrl.toString(), Math.max(totalSeconds - beforeSeconds, 5), dir, 'pagina.webm');

    const output = join(dir, 'video.mp4');
    let lastSaved = 0;
    await renderProposal(
      {
        narration: audioFiles.map((f, i) => ({ src: server.url(f), ...timeline[i] })),
        durationInFrames: totalFrames,
        beforeSiteSrc,
        beforeSiteFrames: beforeSeconds * VIDEO_FPS,
        pageScrollSrc: server.url('pagina.webm'),
        businessName: lead.name,
        city: vars.cidade,
      },
      output,
      (percent) => {
        if (percent >= lastSaved + 10) {
          lastSaved = percent;
          void saveVideo(db, lead.id, { status: 'renderizando', progress: percent });
        }
      },
    );

    const storagePath = `sites/${site.slug}/video-${Date.now()}.mp4`;
    const videoUrl = await uploadMedia(db, storagePath, await readFile(output), 'video/mp4');
    await saveSite(db, { lead_id: lead.id, slug: site.slug, expires_at: site.expires_at, content: { ...site.content, videoUrl } });
    await saveVideo(db, lead.id, { status: 'pronto', progress: 100, storage_path: storagePath, duration_seconds: totalSeconds, error: null });
    await updateLead(db, lead.id, { error: null });
    await logEvent(db, lead.id, 'video_renderizado', { seconds: totalSeconds });
    await moveLead(db, lead, 'revisar_material');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
};

renderVideoJob.onFailure = async (db, job, message) => {
  await saveVideo(db, job.payload.lead_id, { status: 'erro', error: message });
  await logEvent(db, job.payload.lead_id, 'erro_video', { message });
};
