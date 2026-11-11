import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

const randomSuffix = () => randomBytes(4).toString('hex').slice(0, 4);

/** Host do Storage público: as imagens da página só podem vir dele (e do Google Fonts). */
function storageHost(db: Db): string {
  return new URL(db.storage.from('media').getPublicUrl('x').data.publicUrl).hostname;
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

function buildPrompt(name: string, instruction: string | null, problems: string[], hasPrevious: boolean): string {
  const commercialName = process.env.COMMERCIAL_NAME || 'Sharken';
  const lines = [
    `Escreva a página de exemplo de "${name}" no arquivo index.html desta pasta.`,
    'Leia primeiro GUIA.md e siga todas as regras. Os dados estão em brief.json e em material/.',
    `Nome comercial para o aviso do rodapé: ${commercialName}.`,
  ];
  if (hasPrevious) lines.push('O index.html atual é a versão anterior da página. Parta dele.');
  if (instruction) lines.push('', `Pedido do Gabriel para esta versão: "${instruction}"`);
  if (problems.length) {
    lines.push('', 'A versão atual de index.html não passou nas checagens. Corrija todos estes problemas:', ...problems.map((p) => `- ${p}`));
  }
  return lines.join('\n');
}

/** Captura em 390 px e 1280 px. Falha se houver rolagem horizontal. */
async function capture(html: string): Promise<{ problems: string[]; shots: Record<keyof typeof VIEWPORTS, Buffer> | null }> {
  const problems: string[] = [];
  const shots: Partial<Record<keyof typeof VIEWPORTS, Buffer>> = {};
  for (const [key, viewport] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, (typeof VIEWPORTS)[keyof typeof VIEWPORTS]][]) {
    const context = await newContext({ viewport });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const overflow = (await page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')) as boolean;
      if (overflow) problems.push(`A página tem rolagem horizontal em ${viewport.width} px.`);
      shots[key] = await page.screenshot({ fullPage: true, type: 'png' });
    } finally {
      await context.close();
    }
  }
  return { problems, shots: problems.length ? null : (shots as Record<keyof typeof VIEWPORTS, Buffer>) };
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
  const facts = {
    name: lead.name,
    phoneDigits: lead.phone_e164 ?? '',
    sourceText: [buildSourceText(lead), ...brief.material.map((m) => m.texto), instruction].filter(Boolean).join('\n'),
    allowedHosts: [storageHost(db)],
  };

  const dir = await mkdtemp(join(tmpdir(), 'pagina-'));
  try {
    await prepareFolder(dir, brief);
    if (instruction) await restorePrevious(db, existing, dir);
    const model = pageAgentModel();
    let problems: string[] = [];

    for (let attempt = 1; attempt <= PAGE_AGENT.attempts; attempt++) {
      const hasPrevious = await readFile(join(dir, 'index.html'), 'utf8').then(() => true, () => false);
      await runPageAgent(dir, buildPrompt(lead.name, instruction, problems, hasPrevious), model);
      const html = await readFile(join(dir, 'index.html'), 'utf8').catch(() => null);
      if (!html?.trim()) {
        problems = ['O arquivo index.html não foi escrito.'];
        continue;
      }
      problems = checkPageHtml(html, facts);
      if (problems.length) continue;
      const { problems: layout, shots } = await capture(html);
      problems = layout;
      if (!shots) continue;

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
        attempts: attempt,
        instruction,
      });
      await moveLead(db, lead, 'revisar_material', { needs_data: false, error: null });
      await logEvent(db, lead.id, 'pagina_gerada', { generator: 'agente', attempts: attempt });
      return;
    }
    throw new JobFailure(`A página não passou nas checagens em ${PAGE_AGENT.attempts} tentativas: ${problems.join(' ')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

buildPageJob.onFailure = async (db, job, message) => {
  await updateLead(db, job.payload.lead_id, { error: message });
  await logEvent(db, job.payload.lead_id, 'erro_pagina', { message });
};
