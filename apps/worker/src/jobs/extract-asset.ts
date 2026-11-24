import { getAsset, getLead, updateAsset, type Db } from '@lps/db';
import { APIFY_NOT_CONNECTED, APIFY_OUT_OF_CREDIT, buildInstagramInput, extractHtmlText, extractPdfText, INSTAGRAM_ACTOR, instagramToExtract, runActorSync, truncateText, type InstagramExtractProfile, type OnRun } from '@lps/integrations';
import type { LeadAsset } from '@lps/domain';
import { newContext } from '../browser';
import { apifyTokenFor, trackApifyRun, withApifyCredit } from './apify-token';
import { JobFailure, type Handler } from './types';

const BUCKET = 'lead-assets';
const MAX_IMAGES = 8;
const NAV_TIMEOUT_MS = 30_000;

async function copyImages(db: Db, leadId: string, assetId: string, urls: string[]): Promise<string[]> {
  const copied = await Promise.all(
    urls.slice(0, MAX_IMAGES).map(async (url, i) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        const type = (res.headers.get('content-type') ?? '').split(';')[0];
        if (!res.ok || !type.startsWith('image/')) return null;
        const ext = type === 'image/svg+xml' ? 'svg' : type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
        const path = `${leadId}/extraidas/${assetId}-${i}.${ext}`;
        const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: true });
        return error ? null : path;
      } catch {
        return null;
      }
    }),
  );
  return copied.filter((p): p is string => !!p);
}

/** Só http e https: file://, chrome:// e afins não podem ser abertos pelo worker. */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isInstagram(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

async function extractInstagram(url: string, token: string, onRun: OnRun) {
  const [profile] = await withApifyCredit(() => runActorSync<InstagramExtractProfile>(token, INSTAGRAM_ACTOR, buildInstagramInput([url]), { onRun }));
  if (!profile) throw new JobFailure('Não encontrei esse perfil do Instagram.');
  return instagramToExtract(profile);
}

async function extractWebPage(url: string) {
  const context = await newContext();
  try {
    const page = await context.newPage();
    const res = await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
    if (!res || res.status() >= 400) throw new JobFailure(`O site respondeu com erro (${res?.status() ?? 'sem resposta'}).`);
    return extractHtmlText(await page.content(), page.url());
  } finally {
    await context.close();
  }
}

async function download(db: Db, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Falha ao baixar o arquivo: ${error?.message ?? 'vazio'}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function extractFile(db: Db, asset: LeadAsset) {
  if (!asset.storage_path) throw new JobFailure('Arquivo sem caminho no armazenamento.');
  const mime = asset.mime_type ?? '';
  if (mime.startsWith('image/')) return { text: null, images: [asset.storage_path] };
  if (mime === 'application/pdf') return { text: await extractPdfText(await download(db, asset.storage_path)), images: [] };
  if (mime === 'text/plain') return { text: new TextDecoder().decode(await download(db, asset.storage_path)), images: [] };
  // .doc e .docx: ainda sem leitura de texto; o item fica anexado como "pronto".
  return { text: null, images: [] };
}

export const extractAssetJob: Handler = async (db, job) => {
  const asset = await getAsset(db, job.payload.asset_id);
  if (!asset || asset.status === 'pronto') return;

  let text: string | null = null;
  let images: string[] = [];
  if (asset.kind === 'link') {
    if (!asset.url) throw new JobFailure('Link sem endereço.');
    if (!isHttpUrl(asset.url)) throw new JobFailure('Link inválido: use um endereço http ou https.');
    const found = isInstagram(asset.url) ? await extractInstagram(asset.url, await apifyTokenFor(job), trackApifyRun(job.workspace_id!, 'extract', { id: asset.lead_id, batch_id: (await getLead(db, asset.lead_id))?.batch_id ?? null })) : await extractWebPage(asset.url);
    text = found.text;
    images = await copyImages(db, asset.lead_id, asset.id, found.images);
  } else if (asset.kind === 'arquivo') {
    const found = await extractFile(db, asset);
    text = found.text;
    images = found.images;
  } else {
    text = asset.body;
  }
  await updateAsset(db, asset.id, {
    extracted_text: text ? truncateText(text) : null,
    extracted_images: images,
    status: 'pronto',
    error: null,
  });
};

export function friendlyError(message: string): string {
  if (message === APIFY_NOT_CONNECTED || message === APIFY_OUT_OF_CREDIT) return message;
  if (/timeout/i.test(message)) return 'Não consegui abrir o link (timeout).';
  if (/Apify/i.test(message)) return 'Não consegui ler o perfil do Instagram.';
  if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_CERT|net::/i.test(message)) return 'Não consegui abrir o link.';
  if (/baixar o arquivo/i.test(message)) return 'Não consegui ler o arquivo.';
  return message.length <= 120 && /[ãõçé]| o | não /i.test(message) ? message : 'Não consegui extrair este item.';
}

extractAssetJob.onFailure = async (db, job, message) => {
  await updateAsset(db, job.payload.asset_id, { status: 'erro', error: friendlyError(message) });
};
