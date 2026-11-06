import type { Db } from './client';

export type Job = {
  id: string;
  type: string;
  payload: Record<string, string>;
  attempts: number;
  dedupe_key: string | null;
};

export async function enqueueJob(db: Db, job: { type: string; payload: object; dedupeKey?: string; runAfter?: Date }) {
  const row = {
    type: job.type,
    payload: job.payload,
    dedupe_key: job.dedupeKey ?? null,
    run_after: (job.runAfter ?? new Date()).toISOString(),
  };
  const { error } = job.dedupeKey
    ? await db.from('jobs').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    : await db.from('jobs').insert(row);
  if (error) throw new Error(`Falha ao criar tarefa: ${error.message}`);
}

export async function claimNextJob(db: Db): Promise<Job | null> {
  const { data, error } = await db.rpc('claim_next_job');
  if (error) throw new Error(`Falha ao buscar tarefa: ${error.message}`);
  return (data as Job[])[0] ?? null;
}

export async function completeJob(db: Db, id: string) {
  await db.from('jobs').update({ status: 'concluido', dedupe_key: null, locked_at: null }).eq('id', id);
}

export async function failJob(db: Db, id: string, message: string) {
  await db.from('jobs').update({ status: 'erro', error: message, dedupe_key: null, locked_at: null }).eq('id', id);
}

/** Devolve a tarefa à fila, para uma nova tentativa depois do intervalo. */
export async function retryJob(db: Db, id: string, delayMinutes: number, message?: string) {
  const runAfter = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  await db.from('jobs').update({ status: 'pendente', run_after: runAfter, error: message ?? null, locked_at: null }).eq('id', id);
}

export async function countOpenJobs(db: Db, type: string, batchId: string): Promise<number> {
  const { count } = await db
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .eq('payload->>batch_id', batchId)
    .in('status', ['pendente', 'executando']);
  return count ?? 0;
}
