import { countBoxes, listBatches, listCharges, listEventsSince, listOverviewLeads, rowsFromEvents } from '@lps/db';
import { buildPendencies, formatBRL, pendencyHref, summarizeCharges, summarizeResults, type Summary } from '@lps/domain';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/topbar';
import { DailyBars, Donut, Funnel } from '@/components/overview/charts';
import { Card, EmptyState, PageHeader, Table } from '@/components/ui';
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select';
import { authedDb } from '@/lib/auth';
import { startOfTodayBrazil } from '@/lib/dates';

const DAY = 86_400_000;
const PERIODS = [7, 30, 90];
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const FLOW_NAMES: Record<string, string> = { sem_site: 'Sem site', melhorar_site: 'Melhorar site' };

function Kpi({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

const delta = (now: number, before: number, unit = '') => `${now - before >= 0 ? '+' : ''}${now - before}${unit} vs período anterior`;
const Rate = ({ part, total }: { part: number; total: number }) => <>{part} <span className="text-xs text-muted-foreground">{pct(part, total)}%</span></>;

function ResultsTable({ rows, first, names }: { rows: Summary[]; first: string; names?: Record<string, string> }) {
  return (
    <Table head={[first, 'Contatos', 'Aberturas', 'Respostas', 'Vendas']}>
      {rows.map((r) => (
        <tr key={r.key}>
          <td className="px-4 py-2.5">{names?.[r.key] ?? r.key}</td>
          <td className="px-4 py-2.5">{r.contacts}</td>
          <td className="px-4 py-2.5"><Rate part={r.opens} total={r.contacts} /></td>
          <td className="px-4 py-2.5"><Rate part={r.replies} total={r.contacts} /></td>
          <td className="px-4 py-2.5"><Rate part={r.sales} total={r.contacts} /></td>
        </tr>
      ))}
    </Table>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ local?: string; dias?: string }> }) {
  const { local, dias } = await searchParams;
  const period = PERIODS.includes(Number(dias)) ? Number(dias) : 30;
  const db = await authedDb();
  const now = new Date();
  const since = new Date(startOfTodayBrazil(now).getTime() - (period - 1) * DAY);
  const previousSince = new Date(since.getTime() - period * DAY);

  const [batches, allLeads, allEvents, charges, boxes] = await Promise.all([listBatches(db), listOverviewLeads(db), listEventsSince(db, previousSince), listCharges(db), countBoxes(db)]);
  const locations = [...new Map(batches.map((b) => [b.location_key, b.location])).entries()];
  const leads = local ? allLeads.filter((l) => l.batches?.location_key === local) : allLeads;
  const leadIds = new Set(leads.map((l) => l.id));
  const events = allEvents.filter((e) => leadIds.has(e.lead_id));
  const current = events.filter((e) => new Date(e.created_at) >= since);
  const previous = events.filter((e) => new Date(e.created_at) < since);
  const results = summarizeResults(rowsFromEvents(leads, current));
  const before = summarizeResults(rowsFromEvents(leads, previous)).totals;
  const t = results.totals;
  const finance = summarizeCharges(charges);
  const monthlyInvoiced = summarizeCharges(charges.filter((c) => new Date(c.created_at) >= since)).invoiced;
  const pendencies = buildPendencies({ leads, crm: boxes, overdueCharges: charges.filter((c) => c.status === 'vencido').length });

  const dayKey = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  const days = Array.from({ length: period }, (_, i) => new Date(since.getTime() + i * DAY));
  const daily = days.map((d) => {
    const key = dayKey(d);
    const count = (kind: string) => current.filter((e) => e.type === 'mensagem_enviada' && e.data?.kind === kind && dayKey(new Date(e.created_at)) === key).length;
    return { label: `${key.slice(8)}/${key.slice(5, 7)}`, values: [count('primeiro'), count('follow_up')] };
  });
  const flows = ['sem_site', 'melhorar_site'].map((f) => ({ label: FLOW_NAMES[f], value: results.byFlow.find((s) => s.key === f)?.contacts ?? 0 }));

  return (
    <>
      <Topbar crumbs={[{ label: 'Overview' }]} />
      <main className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title="Overview"
          description="Como está a sua prospecção, do primeiro contato até a venda."
          actions={
            <form className="flex flex-wrap gap-2">
              <AutoSubmitSelect name="local" defaultValue={local ?? ''} aria-label="Localização" className="w-48">
                <option value="">Localização: Todas</option>
                {locations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </AutoSubmitSelect>
              <AutoSubmitSelect name="dias" defaultValue={String(period)} aria-label="Período" className="w-44">
                {PERIODS.map((p) => <option key={p} value={p}>Últimos {p} dias</option>)}
              </AutoSubmitSelect>
            </form>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <Kpi label="Contatos" value={t.contacts} note={delta(t.contacts, before.contacts)} />
          <Kpi label="Taxa de abertura" value={`${pct(t.opens, t.contacts)}%`} note={delta(pct(t.opens, t.contacts), pct(before.opens, before.contacts), ' pp')} />
          <Kpi label="Taxa de resposta" value={`${pct(t.replies, t.contacts)}%`} note={delta(pct(t.replies, t.contacts), pct(before.replies, before.contacts), ' pp')} />
          <Kpi label="Vendas" value={t.sales} note={delta(t.sales, before.sales)} />
          <Kpi label="Faturado" value={formatBRL(monthlyInvoiced)} note={`Emitido nos últimos ${period} dias`} />
          <Kpi label="Em aberto" value={formatBRL(finance.open)} note={`${formatBRL(finance.overdue)} em atraso`} />
        </div>

        <Card className="p-5">
          <h2 className="font-medium">Pendências</h2>
          <p className="text-sm text-muted-foreground">O que precisa de você agora.</p>
          {pendencies.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nada pendente.</p> : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {pendencies.map((p) => (
                <li key={p.kind}>
                  <Link href={pendencyHref(p)} className="block rounded-lg border border-border p-3 hover:bg-accent/40">
                    <span className="text-sm">{p.label}</span>
                    <span className="mt-1 block text-2xl font-semibold">{p.count}</span>
                    <span className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      {p.kind === 'cobranca' ? 'em Clientes' : !p.step ? 'no CRM' : p.batchIds.length === 1 ? 'em 1 batch' : `em ${p.batchIds.length} batches`}<ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <Card className="p-5">
            <h2 className="font-medium">Envios por dia</h2>
            <p className="mb-4 text-sm text-muted-foreground">Primeiros contatos e follow-ups enviados por você no WhatsApp.</p>
            <DailyBars days={daily} series={['Primeiro contato', 'Follow-up']} />
          </Card>
          <Card className="p-5">
            <h2 className="font-medium">Contatos por fluxo</h2>
            <p className="mb-4 text-sm text-muted-foreground">Divisão dos {t.contacts} contatos do período.</p>
            <Donut parts={flows} total={flows.reduce((a, b) => a + b.value, 0)} unit="contatos" />
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="font-medium">Funil do processo</h2>
          <p className="mb-4 text-sm text-muted-foreground">Leads que passaram por cada etapa, até o status no CRM, no período. A porcentagem compara com a etapa anterior.</p>
          <Funnel steps={results.funnel} />
        </Card>

        {t.contacts === 0 ? (
          <EmptyState title="Sem contatos no período" description="Os resultados por fluxo e por tipo de negócio aparecem depois dos primeiros envios." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><h2 className="px-4 py-3 font-medium">Por tipo de negócio</h2><ResultsTable rows={results.byBusinessType} first="Tipo de negócio" /></Card>
            <Card><h2 className="px-4 py-3 font-medium">Por fluxo</h2><ResultsTable rows={results.byFlow} first="Fluxo" names={FLOW_NAMES} /></Card>
          </div>
        )}
      </main>
    </>
  );
}
