import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PAGE_AGENT, PAGE_GUIDE_PATH, pageAgentModel } from '@lps/config/page-design';
import { getLead, getSite, listAssets, logEvent, moveLead, saveAgentSite, updateLead, type Db, type SiteRecord } from '@lps/db';
import { buildSourceText, checkPageHtml, checkReadiness, siteSlug, type Lead } from '@lps/domain';
import { uploadMedia } from '@lps/integrations';
import { newContext } from '../browser';
import { runPageAgent } from '../page-agent';
import { buildPageBrief, type PageBrief } from '../page-brief';
import { copyAssetImages, copyLeadPhotos, copyPhoto } from '../photos';
import { JobFailure, Reschedule, type Handler } from './types';

const PAGES_BUCKET = 'pages';
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } } as const;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/** Tempo para um <meta http-equiv="refresh"> imediato aparecer depois do load. */
const SETTLE_MS = 1_000;

const randomSuffix = () => randomBytes(4).toString('hex').slice(0, 4);

/** URL do Storage público: as imagens da página só podem vir dele (e do Google Fonts). */
function storageUrl(db: Db): URL {
  return new URL(db.storage.from('media').getPublicUrl('x').data.publicUrl);
}

async function collectImages(db: Db, lead: Lead, assets: { status: string; extracted_images: string[] }[], slug: string) {
  const extracted = assets.filter((a) => a.status === 'pronto').flatMap((a) => a.extracted_images);
  const [own, fromAssets, logo] = await Promise.all([
    copyLeadPhotos(db, lead, slug),
    copyAssetImages(db, extracted, slug),
    lead.flow === 'melhorar_site' && lead.site_data?.logo ? copyPhoto(db, lead.site_data.logo, `sites/${slug}/logo`) : null,
  ]);
  return { photos: [...own, ...fromAssets], logo };
}

async function prepareFolder(dir: string, brief: PageBrief) {
  await mkdir(join(dir, 'material'));
  await Promise.all(brief.material.map((m) => writeFile(join(dir, m.arquivo), `Origem: ${m.origem}\n\n${m.texto}\n`)));
  const listed = { ...brief, material: brief.material.map(({ arquivo, origem }) => ({ arquivo, origem })) };
  await writeFile(join(dir, 'brief.json'), JSON.stringify(listed, null, 2));
  await copyFile(PAGE_GUIDE_PATH, join(dir, 'GUIA.md'));
}

/** Para o "Refazer": a página anterior vira o ponto de partida. */
async function restorePrevious(db: Db, site: SiteRecord | null, dir: string) {
  if (site?.generator !== 'agente' || !site.html_path) return;
  const { data } = await db.storage.from(PAGES_BUCKET).download(site.html_path);
  if (data) await writeFile(join(dir, 'index.html'), await data.text());
}

function buildPrompt(name: string, instruction: string | null, problems: string[], start: 'nova' | 'refazer' | 'correcao'): string {
  const commercialName = process.env.COMMERCIAL_NAME || 'Sharken';
  const lines = [
    `Escreva a página de exemplo de "${name}" no arquivo index.html desta pasta.`,
    'Leia primeiro GUIA.md e siga todas as regras. Os dados estão em brief.json e em material/.',
    `Nome comercial para o aviso do rodapé: ${commercialName}.`,
  ];
  if (start === 'refazer') lines.push('O index.html atual é a versão anterior da página, já vista pelo Gabriel. Parta dele.');
  if (start === 'correcao') lines.push('O index.html atual é a sua tentativa anterior, que não passou nas checagens. Corrija esse arquivo.');
  if (instruction) lines.push('', `Pedido do Gabriel para esta versão: "${instruction}"`);
  if (problems.length) {
    lines.push('', 'Problemas encontrados na tentativa anterior. Corrija todos:', ...problems.map((p) => `- ${p}`));
  }
  return lines.join('\n');
}

/** Só deixa o navegador carregar o Storage e o Google Fonts. Nada de localhost, rede local ou outros sites. */
function allowedRequest(raw: string, storage: URL): boolean {
  try {
    const url = new URL(raw);
    if (['data:', 'about:', 'blob:'].includes(url.protocol)) return true;
    if (url.origin === storage.origin) return true;
    return url.protocol === 'https:' && FONT_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

type Shots = Record<keyof typeof VIEWPORTS, Buffer>;

/** Captura em 390 px e 1280 px. Falha se houver rolagem horizontal ou se a página tentar sair dela. */
export async function capture(html: string, storage: URL): Promise<{ problems: string[]; shots: Shots | null }> {
  const problems: string[] = [];
  const shots: Partial<Shots> = {};
  for (const [key, viewport] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, (typeof VIEWPORTS)[keyof typeof VIEWPORTS]][]) {
    const context = await newContext({ viewport });
    let leftPage = false;
    try {
      await context.route('**/*', (route) => {
        const request = route.request();
        if (request.isNavigationRequest() && request.frame().parentFrame() === null) leftPage = true;
        return allowedRequest(request.url(), storage) && !request.isNavigationRequest() ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && frame.url() !== 'about:blank') leftPage = true;
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(SETTLE_MS);
      if (leftPage) {
        problems.push('A página tenta abrir outro endereço (meta refresh ou parecido).');
        break;
      }
      const overflow = (await page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')) as boolean;
      if (overflow) problems.push(`A página tem rolagem horizontal em ${viewport.width} px.`);
      shots[key] = await page.screenshot({ fullPage: true, type: 'png' });
    } catch (err) {
      problems.push(
        leftPage
          ? 'A página tenta abrir outro endereço (meta refresh ou parecido).'
          : `A página não abriu no navegador em ${viewport.width} px: ${(err as Error).message.split('\n')[0]}`,
      );
      break;
    } finally {
      await context.close();
    }
  }
  return { problems, shots: problems.length ? null : (shots as Shots) };
}

export const buildPageJob: Handler = async (db, job) => {
  const lead = await getLead(db, job.payload.lead_id);
  if (!lead || lead.stage !== 'gerando_material') return;
  const instruction = typeof job.payload.instruction === 'string' && job.payload.instruction.trim() ? job.payload.instruction.trim() : null;

  const assets = await listAssets(db, lead.id);
  if (assets.some((a) => a.status === 'extraindo')) throw new Reschedule(1);

  const readiness = checkReadiness(lead);
  if (!readiness.ready) {
    await updateLead(db, lead.id, { needs_data: true, error: `Faltam dados: ${readiness.missing.join(', ')}` });
    return;
  }

  const existing = await getSite(db, lead.id);
  const slug = existing?.slug ?? siteSlug(lead.name, randomSuffix);
  const images = await collectImages(db, lead, assets, slug);
  const brief = buildPageBrief(lead, assets, images.photos, images.logo);
  const storage = storageUrl(db);
  const facts = {
    name: lead.name,
    phoneDigits: lead.phone_e164 ?? '',
    sourceText: [buildSourceText(lead), ...brief.material.map((m) => m.texto), instruction].filter(Boolean).join('\n'),
    allowedHosts: [storage.hostname],
  };

  // realpath: no macOS, /var é link para /private/var, e o agente vê o caminho real.
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'pagina-')));
  try {
    await prepareFolder(dir, brief);
    if (instruction) await restorePrevious(db, existing, dir);
    const restored = await readFile(join(dir, 'index.html'), 'utf8').then(() => true, () => false);
    const model = pageAgentModel();
    let problems: string[] = [];
    let costUsd = 0;

    for (let attempt = 1; attempt <= PAGE_AGENT.attempts; attempt++) {
      const hasFile = await readFile(join(dir, 'index.html'), 'utf8').then(() => true, () => false);
      const start = attempt > 1 && hasFile ? 'correcao' : restored ? 'refazer' : 'nova';
      const run = await runPageAgent(dir, buildPrompt(lead.name, instruction, problems, start), model);
      costUsd += run.costUsd;
      // Mesmo com erro do agente (limite de turnos, tempo), o index.html escrito pode servir.
      const html = await readFile(join(dir, 'index.html'), 'utf8').catch(() => null);
      if (!html?.trim()) {
        problems = [run.error ?? 'O arquivo index.html não foi escrito.'];
        continue;
      }
      problems = checkPageHtml(html, facts);
      if (!problems.length) {
        const result = await capture(html, storage);
        problems = result.problems;
        if (result.shots) {
          await publish(db, lead, slug, html, result.shots, { attempt, instruction, costUsd });
          return;
        }
      }
      if (run.error) problems.unshift(run.error);
    }
    throw new JobFailure(`A página não passou nas checagens em ${PAGE_AGENT.attempts} tentativas: ${problems.join(' ')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Sobe a página e as capturas, grava o site e leva o lead para Revisar material. */
async function publish(
  db: Db,
  lead: Lead,
  slug: string,
  html: string,
  shots: Shots,
  run: { attempt: number; instruction: string | null; costUsd: number },
) {
  const htmlPath = `${slug}/index.html`;
  const { error } = await db.storage.from(PAGES_BUCKET).upload(htmlPath, html, { contentType: 'text/html; charset=utf-8', upsert: true });
  if (error) throw new Error(`Falha ao enviar a página: ${error.message}`);
  const version = Date.now();
  const [mobile, desktop] = await Promise.all([
    uploadMedia(db, `sites/${slug}/captura-celular.png`, shots.mobile, 'image/png'),
    uploadMedia(db, `sites/${slug}/captura-computador.png`, shots.desktop, 'image/png'),
  ]);
  await saveAgentSite(db, {
    lead_id: lead.id,
    slug,
    html_path: htmlPath,
    screenshots: { mobile: `${mobile}?v=${version}`, desktop: `${desktop}?v=${version}` },
    attempts: run.attempt,
    instruction: run.instruction,
  });
  await moveLead(db, lead, 'revisar_material', { needs_data: false, error: null });
  await logEvent(db, lead.id, 'pagina_gerada', {
    generator: 'agente',
    attempts: run.attempt,
    cost_usd: Math.round(run.costUsd * 10_000) / 10_000,
  });
}

buildPageJob.onFailure = async (db, job, message) => {
  await updateLead(db, job.payload.lead_id, { error: message });
  await logEvent(db, job.payload.lead_id, 'erro_pagina', { message });
};
