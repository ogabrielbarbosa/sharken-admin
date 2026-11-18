import { createAdminClient, getApifyToken, type Job } from '@lps/db';
import { APIFY_NOT_CONNECTED, APIFY_OUT_OF_CREDIT } from '@lps/integrations';
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
