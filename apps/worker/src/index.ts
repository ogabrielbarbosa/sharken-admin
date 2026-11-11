import './env';
import { getEnv } from '@lps/config';
import { claimNextJob, completeJob, createAdminClient, failJob, retryJob, type Job } from '@lps/db';
import { pollPendingRuns, shouldPollRuns, syncSearchProgress } from '@lps/integrations';
import { closeBrowser } from './browser';
import { handlers, JobFailure, Reschedule } from './jobs';

const POLL_MS = 5_000;
const RUNS_POLL_MS = 10_000;
const MAX_ATTEMPTS = 3;

async function runJob(job: Job) {
  const db = createAdminClient();
  const handler = handlers[job.type];
  if (!handler) {
    await failJob(db, job.id, `Tipo de tarefa desconhecido: ${job.type}`);
    return;
  }
  try {
    await handler(db, job);
    await completeJob(db, job.id);
  } catch (err) {
    if (err instanceof Reschedule) {
      await retryJob(db, job.id, err.delayMinutes);
      return;
    }
    const message = (err as Error).message;
    console.error(`[${job.type}] ${message}`);
    if (err instanceof JobFailure || job.attempts >= MAX_ATTEMPTS) {
      await failJob(db, job.id, message);
      await handler.onFailure?.(db, job, message);
    } else {
      await retryJob(db, job.id, 1, message);
    }
  }
}

let running = true;
async function loop() {
  const db = createAdminClient();
  const pollRuns = shouldPollRuns(getEnv());
  let lastRunsPoll = 0;
  console.log('Worker iniciado. Aguardando tarefas…');
  if (pollRuns) console.log('Sem endereço público: o worker vai buscar o resultado do Apify a cada 10 s.');
  while (running) {
    if (Date.now() - lastRunsPoll > RUNS_POLL_MS) {
      lastRunsPoll = Date.now();
      try {
        // Mostra os negócios na tela enquanto a busca roda.
        await syncSearchProgress();
        if (pollRuns) await pollPendingRuns();
      } catch (err) {
        console.error(`[apify] ${(err as Error).message}`);
      }
    }
    try {
      const job = await claimNextJob(db);
      if (job) {
        console.log(`[${job.type}] ${JSON.stringify(job.payload)}`);
        await runJob(job);
        continue;
      }
    } catch (err) {
      console.error((err as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  await closeBrowser();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { running = false; });
void loop();
