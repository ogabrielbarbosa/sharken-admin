/** De quem é o gasto numa conta do Apify dividida entre projetos. */
export type CostOwner = 'sharken' | 'outros' | 'nao_identificado';

export type CostRun = { id: string; actor: string; startedAt: string; usd: number };
export type TrackedRun = { run_id: string; created_at: string; batch_id: string | null; backfilled: boolean };

export type ApifyCosts = {
  byOwner: Record<CostOwner, number>;
  byActor: { actor: string; runs: number; usd: number; usedBySharken: boolean }[];
  byDay: { day: string; byOwner: Record<CostOwner, number>; total: number }[];
  byBatch: { batchId: string; runs: number; usd: number }[];
  runsTotal: number;
};

const empty = (): Record<CostOwner, number> => ({ sharken: 0, outros: 0, nao_identificado: 0 });

/** Dia no horário de Brasília (UTC-3), no formato AAAA-MM-DD. */
const brazilDay = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Registrada é do Sharken. Ator que o Sharken não usa é de outro projeto. Ator compartilhado sem registro só é
 * de outro projeto depois que o registro começou; antes, não dá para saber.
 */
export function summarizeApifyCosts(runs: CostRun[], tracked: TrackedRun[], sharkenActors: readonly string[]): ApifyCosts {
  const known = new Map(tracked.map((t) => [t.run_id, t]));
  const since = tracked.filter((t) => !t.backfilled).map((t) => new Date(t.created_at).getTime()).reduce((a, b) => Math.min(a, b), Infinity);
  const ownerOf = (run: CostRun): CostOwner => {
    if (known.has(run.id)) return 'sharken';
    if (!sharkenActors.includes(run.actor)) return 'outros';
    return new Date(run.startedAt).getTime() > since ? 'outros' : 'nao_identificado';
  };

  const byOwner = empty();
  const actors = new Map<string, ApifyCosts['byActor'][number]>();
  const days = new Map<string, ApifyCosts['byDay'][number]>();
  const batches = new Map<string, ApifyCosts['byBatch'][number]>();
  for (const run of runs) {
    const owner = ownerOf(run);
    byOwner[owner] += run.usd;

    const actor = actors.get(run.actor) ?? { actor: run.actor, runs: 0, usd: 0, usedBySharken: sharkenActors.includes(run.actor) };
    actor.runs++;
    actor.usd += run.usd;
    actors.set(run.actor, actor);

    const key = brazilDay(run.startedAt);
    const day = days.get(key) ?? { day: key, byOwner: empty(), total: 0 };
    day.byOwner[owner] += run.usd;
    day.total += run.usd;
    days.set(key, day);

    const batchId = known.get(run.id)?.batch_id;
    if (batchId) {
      const batch = batches.get(batchId) ?? { batchId, runs: 0, usd: 0 };
      batch.runs++;
      batch.usd += run.usd;
      batches.set(batchId, batch);
    }
  }
  const desc = (a: { usd: number }, b: { usd: number }) => b.usd - a.usd;
  return {
    byOwner,
    byActor: [...actors.values()].sort(desc),
    byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    byBatch: [...batches.values()].sort(desc),
    runsTotal: runs.reduce((sum, r) => sum + r.usd, 0),
  };
}

export const formatUSD = (value: number) => `US$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
