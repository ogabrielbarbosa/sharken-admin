import { getWorkspaceApify, createAdminClient } from '@lps/db';
import { formatUSD, type CostOwner } from '@lps/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';
import { apifyCosts, cycleDays } from '@/lib/apify-costs';
import { formatDateTime } from '@/lib/lead-labels';

// Cores conferidas para daltonismo no fundo do card; a legenda fica sempre visível.
const OWNERS: { key: CostOwner; label: string; hint: string; color: string }[] = [
  { key: 'sharken', label: 'Sharken', hint: 'Buscas, perfis e imagens deste workspace', color: '#1f88c0' },
  { key: 'outros', label: 'Outros projetos', hint: 'Usam a mesma conta do Apify', color: '#d95926' },
  { key: 'nao_identificado', label: 'Não identificado', hint: 'Antes do registro por execução', color: '#199e70' },
];

const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '—');

function Block({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function Rows({ head, rows }: { head: [string, string, string]; rows: { key: string; name: ReactNode; runs: number; usd: number; total: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="pb-2 font-normal">{head[0]}</th><th className="pb-2 text-right font-normal">{head[1]}</th><th className="pb-2 pl-4 text-right font-normal">{head[2]}</th><th className="pb-2 pl-4 text-right font-normal">%</th></tr>
        </thead>
        <tbody className="divide-y divide-border tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2">{r.name}</td>
              <td className="py-2 text-right">{r.runs}</td>
              <td className="whitespace-nowrap py-2 pl-4 text-right">{formatUSD(r.usd)}</td>
              <td className="py-2 pl-4 text-right text-muted-foreground">{percent(r.usd, r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function CostsTab({ workspaceId }: { workspaceId: string }) {
  const apify = await getWorkspaceApify(createAdminClient(), workspaceId);
  if (!apify) {
    return <Block title="Apify"><p className="text-sm text-muted-foreground">Ainda não conectado. <Link className="underline" href="/painel/configuracoes?aba=apify">Conecte a conta</Link> para ver os custos.</p></Block>;
  }
  let data: Awaited<ReturnType<typeof apifyCosts>>;
  try {
    data = await apifyCosts(apify);
  } catch (err) {
    console.error(`[custos] ${(err as Error).message}`);
    return <Block title="Apify"><p className="text-sm text-destructive">Não consegui consultar os custos agora: {(err as Error).message}</p></Block>;
  }
  const { usage, summary, batchName } = data;
  const used = usage.limitUsd > 0 ? usage.usedUsd / usage.limitUsd : 0;
  const rest = usage.usedUsd - summary.runsTotal;
  const byDay = new Map(summary.byDay.map((d) => [d.day, d]));
  const days = cycleDays(usage.cycleStart);
  const max = Math.max(0.01, ...summary.byDay.map((d) => d.total));
  const label = (iso: string) => dayMonth(iso.slice(0, 10));

  return (
    <>
      <Block title="Apify" description={`Ciclo de ${label(usage.cycleStart)} a ${label(usage.cycleEnd)} · atualizado em ${formatDateTime(usage.readAt)}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p><span className="text-3xl font-semibold">{formatUSD(usage.usedUsd)}</span> <span className="text-sm text-muted-foreground">de {formatUSD(usage.limitUsd)}</span></p>
          <Badge tone={used >= 1 ? 'danger' : used >= 0.8 ? 'warning' : 'success'}>{used >= 1 ? 'Limite atingido' : `${Math.floor(used * 100)}% usado`}</Badge>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${used >= 1 ? 'bg-destructive' : used >= 0.8 ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {OWNERS.map((o) => (
            <div key={o.key}>
              <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span className="size-2.5 rounded-sm" style={{ background: o.color }} />{o.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{formatUSD(summary.byOwner[o.key])} <span className="text-sm font-normal text-muted-foreground">{percent(summary.byOwner[o.key], usage.usedUsd)}</span></dd>
              <dd className="text-xs text-muted-foreground">{o.hint}</dd>
            </div>
          ))}
        </dl>
        {rest >= 0.005 && <p className="mt-4 text-xs text-muted-foreground">Mais {formatUSD(rest)} de armazenamento e outros gastos fora das execuções.</p>}
      </Block>

      <Block title="Por dia" description="Gasto das execuções, no horário de Brasília.">
        <p className="mb-2 text-xs text-muted-foreground">Maior dia: {formatUSD(summary.byDay.length ? max : 0)}</p>
        <div className="flex h-36 items-end border-b border-border">
          {days.map((day) => {
            const d = byDay.get(day);
            const text = `${dayMonth(day)}: ${formatUSD(d?.total ?? 0)}`;
            return (
              <div key={day} tabIndex={0} aria-label={text} className="group relative flex h-full flex-1 items-end justify-center outline-none hover:bg-white/5 focus-visible:bg-white/5">
                <div className="flex w-full max-w-6 flex-col-reverse gap-0.5 overflow-hidden rounded-t px-0.5" style={{ height: `${((d?.total ?? 0) / max) * 100}%` }}>
                  {d && OWNERS.filter((o) => d.byOwner[o.key] > 0).map((o) => <div key={o.key} className="min-h-px shrink" style={{ background: o.color, flexGrow: d.byOwner[o.key], flexBasis: 0 }} />)}
                </div>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs shadow-overlay group-hover:block group-focus-visible:block">
                  <p className="text-muted-foreground">{dayMonth(day)}</p>
                  <p className="font-semibold">{formatUSD(d?.total ?? 0)}</p>
                  {d && OWNERS.filter((o) => d.byOwner[o.key] > 0).map((o) => (
                    <p key={o.key} className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: o.color }} /><b>{formatUSD(d.byOwner[o.key])}</b> <span className="text-muted-foreground">{o.label}</span></p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{days[0] && dayMonth(days[0])}</span><span>{days.length > 1 && dayMonth(days.at(-1)!)}</span></div>
      </Block>

      <Block title="Por ator" description="Cada ator é um robô do Apify.">
        <Rows head={['Ator', 'Execuções', 'Custo']} rows={summary.byActor.map((a) => ({
          key: a.actor, runs: a.runs, usd: a.usd, total: summary.runsTotal,
          name: <>{a.actor} {!a.usedBySharken && <span className="ml-1"><Badge>Fora do Sharken</Badge></span>}</>,
        }))} />
      </Block>

      <Block title="Por batch" description="Busca, perfis e imagens de cada batch neste ciclo. O % é sobre o gasto do Sharken.">
        {summary.byBatch.length ? (
          <Rows head={['Batch', 'Execuções', 'Custo']} rows={summary.byBatch.map((b) => ({
            key: b.batchId, runs: b.runs, usd: b.usd, total: summary.byOwner.sharken,
            name: <Link className="hover:underline" href={`/painel/batches/${b.batchId}`}>{batchName(b.batchId)}</Link>,
          }))} />
        ) : <p className="text-sm text-muted-foreground">Nenhum batch com custo registrado neste ciclo.</p>}
      </Block>
    </>
  );
}
