import type { Db, Job } from '@lps/db';

/** Tenta de novo depois do intervalo, sem contar como erro. */
export class Reschedule extends Error {
  constructor(public delayMinutes: number) {
    super('reagendada');
  }
}

/** Erro definitivo: não adianta tentar de novo. */
export class JobFailure extends Error {}

export type Handler = ((db: Db, job: Job) => Promise<void>) & {
  onFailure?: (db: Db, job: Job, message: string) => Promise<void>;
};
