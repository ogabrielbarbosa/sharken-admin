import './env';
import { claimNextJob, completeJob, createAdminClient, failJob, retryJob, type Job } from '@lps/db';
import { closeBrowser } from './browser';
import { handlers, JobFailure, Reschedule } from './jobs';

const POLL_MS = 5_000;
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
  console.log('Worker iniciado. Aguardando tarefas…');
  while (running) {
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
