import { createAdminClient, getApifyToken, recordApifyRun, type ApifyRunPurpose, type Job } from '@lps/db';
import { APIFY_NOT_CONNECTED, APIFY_OUT_OF_CREDIT, INSTAGRAM_ACTOR, type OnRun } from '@lps/integrations';
import { JobFailure } from './types';

/** Token do Apify do workspace da tarefa. Sem ele não adianta tentar de novo: falha definitiva com o aviso. */
export async function apifyTokenFor(job: Job): Promise<string> {
  const token = job.workspace_id ? await getApifyToken(createAdminClient(), job.workspace_id) : null;
  if (!token) throw new JobFailure(APIFY_NOT_CONNECTED);
  return token;
}

/** Crédito esgotado também é definitivo: só volta no mês seguinte. */
export async function withApifyCredit<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as Error).message === APIFY_OUT_OF_CREDIT) throw new JobFailure(APIFY_OUT_OF_CREDIT);
    throw err;
  }
}

/** Registra de quem é a execução, para a tela de custos. */
export function trackApifyRun(workspaceId: string, purpose: ApifyRunPurpose, lead?: { id: string; batch_id: string | null } | null): OnRun {
  return (runId) => recordApifyRun(createAdminClient(), { run_id: runId, workspace_id: workspaceId, actor: INSTAGRAM_ACTOR, purpose, lead_id: lead?.id ?? null, batch_id: lead?.batch_id ?? null });
}
