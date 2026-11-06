import { countOpenJobs, getBatch, getContactContext, getLead, logEvent, moveLead, updateBatch, updateLead, type Db, type Job } from '@lps/db';
import { checkEliminatory, classifyLink, flowFromSiteStatus, nextCheckStep, scoreLead, DEFAULT_CRITERIA, type Lead, type SiteStatus } from '@lps/domain';
import { analyzeLead } from '@lps/integrations';
import { probeSite } from '../site-probe';
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

  const lead = await resolveSite(db, current);

  // Uma falha da IA é repetida pelo worker. Depois das tentativas, onFailure segue sem o resumo.
  const analysis = await analyzeLead(lead);
  await updateLead(db, lead.id, { summary: analysis.summary, reason: lead.flow === 'melhorar_site' ? analysis.reason : null, error: null });
  await qualify(db, lead);
  await finishBatchIfDone(db, job.payload.batch_id);
};

async function qualify(db: Db, lead: Lead) {
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  const criteria = batch?.criteria ?? DEFAULT_CRITERIA;
  const now = new Date();
  const ctx = await getContactContext(db, lead);
  const eliminated = checkEliminatory(lead, { ...ctx, now }, criteria);
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
