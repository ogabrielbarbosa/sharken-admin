import type { CostRun } from '@lps/domain';
import { apifyErrorMessage } from './apify';

const BASE = 'https://api.apify.com/v2';
const PAGE = 1000;

export type ApifyUsage = { cycleStart: string; cycleEnd: string; usedUsd: number; limitUsd: number; runs: CostRun[] };

/** Uso do ciclo atual e as execuções dele, com o custo de cada uma. Qualquer falha lança: zero seria mentira. */
export async function fetchApifyUsage(token: string, fetcher: typeof fetch = fetch): Promise<ApifyUsage> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetcher(`${BASE}/${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(apifyErrorMessage(res.status, await res.json().catch(() => null), 'Não foi possível consultar os custos no Apify'));
    return ((await res.json()) as { data: T }).data;
  };
  const limits = await get<{ monthlyUsageCycle: { startAt: string; endAt: string }; limits: { maxMonthlyUsageUsd: number }; current: { monthlyUsageUsd: number } }>('users/me/limits');

  type Item = { id: string; actId: string; startedAt: string; usageTotalUsd?: number | null };
  const items: Item[] = [];
  for (;;) {
    const page = await get<{ total: number; items: Item[] }>(`actor-runs?limit=${PAGE}&offset=${items.length}&startedAfter=${encodeURIComponent(limits.monthlyUsageCycle.startAt)}`);
    items.push(...page.items);
    if (page.items.length < PAGE) break;
  }

  // Ator removido da loja não tem mais nome: fica o id.
  const names = new Map(await Promise.all([...new Set(items.map((i) => i.actId))].map(async (id) =>
    [id, await get<{ name: string; username: string }>(`acts/${id}`).then((a) => `${a.username}/${a.name}`, () => id)] as const)));
  return {
    cycleStart: limits.monthlyUsageCycle.startAt,
    cycleEnd: limits.monthlyUsageCycle.endAt,
    usedUsd: limits.current.monthlyUsageUsd,
    limitUsd: limits.limits.maxMonthlyUsageUsd,
    runs: items.map((i) => ({ id: i.id, actor: names.get(i.actId)!, startedAt: i.startedAt, usd: i.usageTotalUsd ?? 0 })),
  };
}
