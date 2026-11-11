import { isFollowUpDue } from './contact-rules';
import { stagesOf, type LeadStage, type ProcessStep } from './stages';

export type ResultRow = {
  flow: string | null;
  business_type: string | null;
  found: boolean;
  advanced: boolean;
  approved: boolean;
  contacted: boolean;
  opened: boolean;
  replied: boolean;
  sold: boolean;
};

export type Summary = { key: string; contacts: number; opens: number; replies: number; sales: number };
export type FunnelStep = { label: string; count: number; rate: number | null };

function summarize(key: string, rows: ResultRow[]): Summary {
  const contacted = rows.filter((r) => r.contacted);
  return {
    key,
    contacts: contacted.length,
    opens: contacted.filter((r) => r.opened).length,
    replies: contacted.filter((r) => r.replied).length,
    sales: rows.filter((r) => r.sold).length,
  };
}

function groupBy(rows: ResultRow[], keyOf: (r: ResultRow) => string | null): Summary[] {
  const groups = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const key = keyOf(row) ?? 'sem tipo';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([key, list]) => summarize(key, list)).sort((a, b) => b.contacts - a.contacts);
}

export function summarizeResults(rows: ResultRow[]) {
  const steps: [string, (r: ResultRow) => boolean][] = [
    ['Revisados', (r) => r.found],
    ['Avançados', (r) => r.advanced],
    ['Material aprovado', (r) => r.approved],
    ['Contatados', (r) => r.contacted],
    ['Responderam', (r) => r.replied],
    ['Vendidos', (r) => r.sold],
  ];
  const funnel: FunnelStep[] = [];
  for (const [label, test] of steps) {
    const count = rows.filter(test).length;
    const previous = funnel.at(-1)?.count;
    funnel.push({ label, count, rate: previous === undefined ? null : previous ? Math.round((count / previous) * 100) : 0 });
  }
  return {
    totals: summarize('total', rows),
    byFlow: groupBy(rows.filter((r) => r.contacted), (r) => r.flow),
    byBusinessType: groupBy(rows.filter((r) => r.contacted), (r) => r.business_type),
    funnel,
  };
}

export type Pendency = { kind: 'follow_up' | 'revisar' | 'completar' | 'crm' | 'cobranca'; label: string; count: number; batchIds: string[]; step?: ProcessStep };
type PendingLead = { batch_id: string | null; stage: LeadStage; contacted_at: string | null };

export function buildPendencies(input: { leads: PendingLead[]; overdueCharges: number; now: Date }): Pendency[] {
  const group = (kind: Pendency['kind'], label: string, step: ProcessStep | undefined, list: PendingLead[]): Pendency | null => {
    if (!list.length) return null;
    return { kind, label, step, count: list.length, batchIds: [...new Set(list.map((l) => l.batch_id).filter((b): b is string => !!b))] };
  };
  const inStep = (step: ProcessStep, only?: LeadStage) => input.leads.filter((l) => (only ? l.stage === only : stagesOf(step).includes(l.stage)));
  const list = [
    group('follow_up', 'Follow-ups vencidos', undefined, input.leads.filter((l) => isFollowUpDue(l, input.now))),
    group('revisar', 'Leads para revisar', 'revisar', inStep('revisar')),
    group('completar', 'Leads para completar', 'completar', inStep('completar')),
    group('crm', 'Leads no CRM', undefined, input.leads.filter((l) => l.stage === 'crm')),
  ].filter((p): p is Pendency => !!p);
  if (input.overdueCharges) list.push({ kind: 'cobranca', label: 'Cobranças vencidas', count: input.overdueCharges, batchIds: [] });
  return list;
}

export function pendencyHref(p: Pendency): string {
  if (p.kind === 'cobranca') return '/painel/clientes?situacao=em_atraso';
  if (!p.step) return '/painel/crm';
  return p.batchIds.length === 1 ? `/painel/batches/${p.batchIds[0]}/${p.step}` : `/painel/batches?etapa=${p.step}`;
}
