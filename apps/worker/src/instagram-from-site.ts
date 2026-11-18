import './env';
import { createAdminClient, enqueueJob, getApifyToken, getBatch, INSTAGRAM_MEDIA_JOB, logEvent, scopeDb, updateLead, workspaceOfRow, type Db } from '@lps/db';
import { classifyLink, DEFAULT_CRITERIA, instagramProfileFromLinks, scoreLead, type Lead } from '@lps/domain';
import { fetchDataset, getRun, INSTAGRAM_ACTOR, latestPostDate, runOutcome, startActorRun, usernameFromUrl, type InstagramProfile } from '@lps/integrations';
import { closeBrowser } from './browser';
import { probeSite } from './site-probe';

/**
 * Leads analisados antes de o sistema ler o Instagram do site: abre o site de novo, acha o perfil,
 * busca a data do último post (uma busca no Apify por workspace), refaz a nota de quem está em Novo lead
 * e, para quem já passou de Qualificado, pede as imagens do Instagram.
 * Uso: pnpm leads:instagram-from-site <batch_id | --all> [--dry]
 */
const args = process.argv.slice(2).filter((a) => a !== '--');
const dry = args.includes('--dry');
const target = args.find((a) => !a.startsWith('--')) ?? (args.includes('--all') ? 'all' : null);
if (!target) {
  console.error('Uso: pnpm leads:instagram-from-site <batch_id | --all> [--dry]');
  process.exit(1);
}

const admin = createAdminClient();
const AFTER_QUALIFIED = ['completar', 'pagina', 'video', 'crm', 'vendido', 'sem_interesse'];

async function batchesToFix(): Promise<{ id: string; workspaceId: string }[]> {
  if (target !== 'all') {
    const workspaceId = await workspaceOfRow(admin, 'batches', target!);
    if (!workspaceId) throw new Error('Batch não encontrado.');
    return [{ id: target!, workspaceId }];
  }
  const { data, error } = await admin.from('batches').select('id, workspace_id').order('created_at');
  if (error) throw new Error(error.message);
  return (data as { id: string; workspace_id: string }[]).map((b) => ({ id: b.id, workspaceId: b.workspace_id }));
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await run(item);
  }));
}

/** Uma busca no Apify para todos os perfis do workspace. Devolve usuário → data do último post. */
async function lastPosts(token: string, usernames: string[]): Promise<Map<string, string>> {
  const runId = await startActorRun(token, INSTAGRAM_ACTOR, { usernames }, null);
  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const run = await getRun(token, runId);
    const outcome = runOutcome(run.status);
    if (outcome === 'pending') continue;
    if (outcome === 'failed' || !run.defaultDatasetId) throw new Error(`Busca do Instagram terminou como ${run.status}.`);
    const profiles = await fetchDataset<InstagramProfile>(token, run.defaultDatasetId);
    const dates = new Map<string, string>();
    for (const p of profiles) {
      const date = latestPostDate(p);
      if (p.username && date) dates.set(p.username.toLowerCase(), date);
    }
    return dates;
  }
}

type Found = { db: Db; lead: Lead; instagram_url: string };
const byWorkspace = new Map<string, Found[]>();
let checked = 0;

for (const batch of await batchesToFix()) {
  const db = scopeDb(admin, batch.workspaceId);
  const { data, error } = await db.from('leads').select('*').eq('batch_id', batch.id).is('instagram_url', null).eq('site_status', 'funcionando');
  if (error) throw new Error(error.message);
  const leads = (data as Lead[]).filter((l) => classifyLink(l.website_url).status === 'site');
  if (!leads.length) continue;
  console.log(`Batch ${batch.id}: ${leads.length} leads com site e sem Instagram.`);

  await pool(leads, 4, async (lead) => {
    checked++;
    let links = lead.site_data?.instagramLinks;
    if (!links) {
      const probe = await probeSite(lead.website_url!).catch(() => null);
      if (probe?.result !== 'ok') {
        console.log(`  ✗ ${lead.name}: site não abriu`);
        return;
      }
      links = probe.data.instagramLinks ?? [];
      // Guarda os links na página já lida, sem trocar o resto (a análise foi feita com ela).
      if (!dry) await updateLead(db, lead.id, { site_data: { ...(lead.site_data ?? probe.data), instagramLinks: links } });
    }
    const instagram_url = instagramProfileFromLinks(links);
    if (!instagram_url) return;
    console.log(`  ✓ ${lead.name}: ${instagram_url}`);
    const list = byWorkspace.get(batch.workspaceId) ?? [];
    list.push({ db, lead, instagram_url });
    byWorkspace.set(batch.workspaceId, list);
  });
}
await closeBrowser();

const found = [...byWorkspace.values()].flat();
console.log(`\n${found.length} Instagrams achados em ${checked} sites.`);
if (dry || !found.length) process.exit(0);

for (const [workspaceId, items] of byWorkspace) {
  let dates = new Map<string, string>();
  const token = await getApifyToken(admin, workspaceId);
  if (!token) console.log(`Workspace ${workspaceId} sem token do Apify: os links entram sem a data do último post.`);
  else {
    try {
      dates = await lastPosts(token, [...new Set(items.map((i) => usernameFromUrl(i.instagram_url)!))]);
    } catch (err) {
      console.log(`Workspace ${workspaceId}: ${(err as Error).message} Os links entram sem a data.`);
    }
  }

  for (const { db, lead, instagram_url } of items) {
    const patch: Partial<Lead> = { instagram_url, instagram_last_post_at: dates.get(usernameFromUrl(instagram_url)!) ?? null };
    if (lead.stage === 'revisar') {
      const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
      const { score, reasons } = scoreLead({ ...lead, ...patch }, batch?.criteria ?? DEFAULT_CRITERIA, new Date());
      patch.score = score;
      patch.score_reasons = reasons;
    }
    await updateLead(db, lead.id, patch);
    await logEvent(db, lead.id, 'instagram_do_site', { instagram_url });
    if (AFTER_QUALIFIED.includes(lead.stage) && !lead.instagram_media?.length) {
      await enqueueJob(db, { type: INSTAGRAM_MEDIA_JOB, payload: { lead_id: lead.id }, dedupeKey: `${INSTAGRAM_MEDIA_JOB}:${lead.id}:site` });
    }
  }
}
console.log('Pronto.');
process.exit(0);
