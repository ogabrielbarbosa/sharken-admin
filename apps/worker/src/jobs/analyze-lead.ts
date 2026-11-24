import { countOpenJobs, createAdminClient, getApifyToken, getBatch, getContactContext, getLead, logEvent, moveLead, updateBatch, updateLead, type Db, type Job } from '@lps/db';
import { bestContacts, checkEliminatory, looksLikeFranchise, classifyLink, instagramProfileFromLinks, flowFromSiteStatus, nextCheckStep, scoreLead, DEFAULT_CRITERIA, type Lead, type SiteStatus } from '@lps/domain';
import { analyzeLead, defaultEnrichDeps, enrichLead, instagramLastPostAt, RateLimited } from '@lps/integrations';
import { probeSite } from '../site-probe';
import { trackApifyRun } from './apify-token';
import { Reschedule, type Handler } from './types';

async function resolveSite(db: Db, lead: Lead): Promise<Lead> {
  if (lead.site_status) return lead;
  const link = classifyLink(lead.website_url);
  let site_status: SiteStatus;
  let patch: Partial<Lead> = {};

  if (link.status !== 'site') {
    site_status = link.status;
  } else {
    const probe = await probeSite(lead.website_url!);
    if (probe.result === 'ok') {
      site_status = 'funcionando';
      patch = { site_signals: probe.signals, site_data: probe.data };
    } else {
      const checks = [...lead.site_checks, { at: new Date().toISOString(), detail: probe.detail }];
      const step = nextCheckStep(checks.length);
      if (step.action === 'tentar_de_novo') {
        await updateLead(db, lead.id, { site_checks: checks });
        throw new Reschedule(step.delayMinutes);
      }
      site_status = 'fora_do_ar';
      patch = { site_checks: checks };
    }
  }
  const full = { ...patch, site_status, flow: flowFromSiteStatus(site_status) };
  await updateLead(db, lead.id, full);
  return { ...lead, ...full };
}

/**
 * O Google muitas vezes não traz o Instagram, mas o site do lead tem o link (rodapé, ícones).
 * A busca do Instagram do batch já passou, então a data do último post é buscada só para esse perfil.
 * Sem token do Apify ou com falha nele, o lead fica com o link e sem a data.
 */
export async function resolveSiteInstagram(db: Db, lead: Lead, workspaceId: string | null | undefined): Promise<Lead> {
  if (lead.instagram_url) return lead;
  const instagram_url = instagramProfileFromLinks(lead.site_data?.instagramLinks ?? []);
  if (!instagram_url) return lead;
  const patch: Partial<Lead> = { instagram_url };
  try {
    const token = workspaceId ? await getApifyToken(createAdminClient(), workspaceId) : null;
    if (token) patch.instagram_last_post_at = await instagramLastPostAt(token, instagram_url, trackApifyRun(workspaceId!, 'instagram_post', lead));
  } catch {
    // Sem a data o lead só deixa de pontuar o critério do Instagram ativo.
  }
  await updateLead(db, lead.id, patch);
  await logEvent(db, lead.id, 'instagram_do_site', { instagram_url });
  return { ...lead, ...patch };
}

/** Lead manual não passou pela leitura dos perfis: busca a data do último post do Instagram informado. */
async function resolveManualInstagram(db: Db, lead: Lead, workspaceId: string | null | undefined): Promise<Lead> {
  if (!lead.instagram_url || lead.instagram_last_post_at || !lead.batch_id || !workspaceId) return lead;
  if ((await getBatch(db, lead.batch_id))?.source !== 'manual') return lead;
  try {
    const token = await getApifyToken(createAdminClient(), workspaceId);
    const date = token ? await instagramLastPostAt(token, lead.instagram_url, trackApifyRun(workspaceId, 'instagram_post', lead)) : null;
    if (!date) return lead;
    await updateLead(db, lead.id, { instagram_last_post_at: date });
    return { ...lead, instagram_last_post_at: date };
  } catch {
    // Sem token ou sem crédito no Apify, o lead só deixa de pontuar o Instagram ativo.
    return lead;
  }
}

const MAX_RATE_LIMIT_WAITS = 5;
const rateLimitWaits = new Map<string, number>();

/**
 * Contatos fora do Google: e-mail e celular no site, WHOIS do domínio .br e cadastro do CNPJ.
 * Roda uma vez por lead. O celular achado só entra quando o Google não trouxe um.
 */
export async function resolveEnrichment(db: Db, lead: Lead): Promise<Lead> {
  if (lead.enrichment) return lead;
  let enrichment;
  try {
    enrichment = await enrichLead(lead);
  } catch (err) {
    if (!(err instanceof RateLimited)) throw err;
    // O CNPJ.ws libera de novo em um minuto. Depois de algumas esperas, segue sem ele.
    const waits = (rateLimitWaits.get(lead.id) ?? 0) + 1;
    rateLimitWaits.set(lead.id, waits);
    if (waits <= MAX_RATE_LIMIT_WAITS) throw new Reschedule(1);
    enrichment = await enrichLead(lead, { ...defaultEnrichDeps(), cnpjWs: async () => null });
    enrichment.notes.push('CNPJ.ws limitou as consultas: e-mail do CNPJ não consultado.');
  }
  rateLimitWaits.delete(lead.id);
  const best = bestContacts(enrichment);
  const patch: Partial<Lead> = { enrichment, email: lead.email ?? best.email };
  if (!lead.phone_e164 && best.mobile) patch.phone_e164 = best.mobile;
  await updateLead(db, lead.id, patch);
  return { ...lead, ...patch };
}

export async function finishBatchIfDone(db: Db, batchId: string | null | undefined, currentJobs = 1) {
  if (!batchId) return;
  const open = await countOpenJobs(db, 'analyze_lead', batchId);
  if (open > currentJobs) return;
  const batch = await getBatch(db, batchId);
  if (batch?.status === 'analisando') await updateBatch(db, batchId, { status: 'concluido' });
}

export const analyzeLeadJob: Handler = async (db, job: Job) => {
  const current = await getLead(db, job.payload.lead_id);
  if (!current || current.stage !== 'analisando') {
    await finishBatchIfDone(db, job.payload.batch_id);
    return;
  }

  const enriched = await resolveEnrichment(db, await resolveSiteInstagram(db, await resolveSite(db, current), job.workspace_id));
  const lead = await resolveManualInstagram(db, enriched, job.workspace_id);

  // Uma falha da IA é repetida pelo worker. Depois das tentativas, onFailure segue sem o resumo.
  const analysis = await analyzeLead(lead);
  const patch = { summary: analysis.summary, reason: lead.flow === 'melhorar_site' ? analysis.reason : null, franchise: analysis.franchise || looksLikeFranchise(lead.enrichment), error: null };
  await updateLead(db, lead.id, patch);
  await qualify(db, { ...lead, ...patch });
  await finishBatchIfDone(db, job.payload.batch_id);
};

async function qualify(db: Db, lead: Lead) {
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  const criteria = batch?.criteria ?? DEFAULT_CRITERIA;
  const now = new Date();
  const ctx = await getContactContext(db, lead);
  const eliminated = checkEliminatory(lead, { ...ctx, now }, criteria, batch?.source === 'manual');
  if (!eliminated.passed) {
    await moveLead(db, lead, 'descartado', { exit_reason: eliminated.reasons.join('; ') }, { reasons: eliminated.reasons });
    return;
  }
  const { score, reasons } = scoreLead(lead, criteria, now);
  await moveLead(db, lead, 'revisar', { score, score_reasons: reasons });
}

analyzeLeadJob.onFailure = async (db, job, message) => {
  const lead = await getLead(db, job.payload.lead_id);
  if (!lead || lead.stage !== 'analisando') return;
  await updateLead(db, lead.id, { error: `Análise sem resumo: ${message}` });
  await logEvent(db, lead.id, 'erro_analise', { message });
  if (lead.site_status) await qualify(db, lead);
  await finishBatchIfDone(db, job.payload.batch_id, 0);
};
