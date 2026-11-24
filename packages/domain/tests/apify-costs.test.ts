import { describe, expect, it } from 'vitest';
import { formatUSD, summarizeApifyCosts, type CostRun, type TrackedRun } from '../src/apify-costs';

const run = (id: string, actor: string, usd: number, startedAt = '2026-11-10T12:00:00Z'): CostRun => ({ id, actor, usd, startedAt });
const tracked = (run_id: string, extra: Partial<TrackedRun> = {}): TrackedRun => ({ run_id, created_at: '2026-11-20T12:00:00Z', batch_id: null, backfilled: false, ...extra });

describe('summarizeApifyCosts', () => {
  it('separa Sharken, outros projetos e o que não dá para saber', () => {
    const c = summarizeApifyCosts([run('a', 'maps', 1), run('b', 'maps', 2), run('c', 'tiktok', 4), run('d', 'maps', 8, '2026-11-21T12:00:00Z')], [tracked('a')], ['maps']);
    expect(c.byOwner).toEqual({ sharken: 1, nao_identificado: 2, outros: 12 });
    expect(c.runsTotal).toBe(15);
  });
  it('só execuções ligadas depois não marcam o início do registro', () => {
    const c = summarizeApifyCosts([run('b', 'maps', 2, '2026-11-23T12:00:00Z')], [tracked('x', { backfilled: true })], ['maps']);
    expect(c.byOwner.nao_identificado).toBe(2);
  });
  it('agrupa por ator, do maior para o menor, e por batch', () => {
    const c = summarizeApifyCosts([run('a', 'maps', 1), run('b', 'ig', 2), run('c', 'maps', 3)], [tracked('a', { batch_id: 'B' }), tracked('b', { batch_id: 'B' })], ['maps']);
    expect(c.byActor.map((a) => [a.actor, a.runs, a.usd, a.usedBySharken])).toEqual([['maps', 2, 4, true], ['ig', 1, 2, false]]);
    expect(c.byBatch).toEqual([{ batchId: 'B', runs: 2, usd: 3 }]);
  });
  it('o dia é o de Brasília', () => {
    expect(summarizeApifyCosts([run('a', 'x', 1, '2026-11-18T01:35:00Z')], [], []).byDay[0]!.day).toBe('2026-11-17');
  });
  it('sem execuções', () => {
    expect(summarizeApifyCosts([], [], [])).toMatchObject({ byActor: [], byDay: [], byBatch: [], runsTotal: 0 });
  });
});

it('formatUSD', () => expect(formatUSD(29.176)).toBe('US$ 29,18'));
