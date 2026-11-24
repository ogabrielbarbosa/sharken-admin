import { afterEach, describe, expect, it, vi } from 'vitest';
import { runActorSync } from '../src/apify';
import { fetchApifyUsage } from '../src/apify-costs';

const json = (data: unknown) => new Response(JSON.stringify({ data }));
afterEach(() => vi.unstubAllGlobals());

describe('fetchApifyUsage', () => {
  const limits = { monthlyUsageCycle: { startAt: '2026-11-06T00:00:00.000Z', endAt: '2026-12-05T23:59:59.999Z' }, limits: { maxMonthlyUsageUsd: 29 }, current: { monthlyUsageUsd: 29.17 } };
  it('lê o ciclo, as páginas de execuções e o nome dos atores', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, actId: 'A', startedAt: '2026-11-07T00:00:00Z', usageTotalUsd: 0.01 }));
    const fetcher = vi.fn(async (u: string) => {
      if (u.includes('limits')) return json(limits);
      if (u.includes('/acts/A')) return json({ username: 'apify', name: 'x' });
      if (u.includes('/acts/')) return new Response('{}', { status: 404 });
      return json({ items: u.includes('offset=0') ? full : [{ id: 'z', actId: 'B', startedAt: '2026-11-08T00:00:00Z' }] });
    });
    const usage = await fetchApifyUsage('t', fetcher as unknown as typeof fetch);
    expect(usage).toMatchObject({ usedUsd: 29.17, limitUsd: 29 });
    expect(usage.runs).toHaveLength(1001);
    expect(usage.runs[0]).toMatchObject({ actor: 'apify/x', usd: 0.01 });
    expect(usage.runs[1000]).toMatchObject({ actor: 'B', usd: 0 });
  });
  it('falha do Apify lança', async () => {
    await expect(fetchApifyUsage('t', (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch)).rejects.toThrow('custos');
  });
});

describe('runActorSync', () => {
  const stub = (status: string) => vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => {
    const s = String(u);
    if (s.includes('/acts/')) return json({ id: 'r1', status: 'RUNNING' });
    if (s.includes('/actor-runs/r1')) return json({ id: 'r1', status, defaultDatasetId: 'd' });
    return new Response(JSON.stringify([{ ok: 1 }]));
  }));
  it('avisa o id, espera terminar e devolve os itens', async () => {
    stub('SUCCEEDED');
    const onRun = vi.fn(async () => undefined);
    expect(await runActorSync('t', 'a/b', {}, { onRun })).toEqual([{ ok: 1 }]);
    expect(onRun).toHaveBeenCalledWith('r1');
  });
  it('execução que falha lança', async () => {
    stub('FAILED');
    await expect(runActorSync('t', 'a/b', {})).rejects.toThrow('FAILED');
  });
});
