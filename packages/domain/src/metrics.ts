import type { LeadStage } from './stages';

type ProcessStep = 'revisar' | 'completar';

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
    ['Em conversa', (r) => r.replied],
    ['Fechados', (r) => r.sold],
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

export type Pendency = {
  kind: 'hoje' | 'novos' | 'em_conversa' | 'revisar' | 'completar' | 'cobranca';
  label: string;
  count: number;
  batchIds: string[];
  step?: ProcessStep;
};
type PendingLead = { batch_id: string | null; stage: LeadStage };
export type CrmCounts = { hoje: number; novos: number; em_conversa: number };

const CRM_PENDENCIES: { kind: 'hoje' | 'novos' | 'em_conversa'; label: string }[] = [
  { kind: 'hoje', label: 'Contatos para hoje' },
  { kind: 'novos', label: 'Contatos novos' },
  { kind: 'em_conversa', label: 'Em conversa' },
];

export function buildPendencies(input: { leads: PendingLead[]; crm: CrmCounts; overdueCharges: number }): Pendency[] {
  const list: Pendency[] = CRM_PENDENCIES.filter((p) => input.crm[p.kind] > 0).map((p) => ({ ...p, count: input.crm[p.kind], batchIds: [] }));
  const inStep = (step: ProcessStep) => input.leads.filter((l) => l.stage === step);
  for (const [kind, label, step] of [['revisar', 'Leads para revisar', 'revisar'], ['completar', 'Leads para completar', 'completar']] as const) {
    const leads = inStep(step);
    if (leads.length) list.push({ kind, label, step, count: leads.length, batchIds: [...new Set(leads.map((l) => l.batch_id).filter((b): b is string => !!b))] });
  }
  if (input.overdueCharges) list.push({ kind: 'cobranca', label: 'Cobranças vencidas', count: input.overdueCharges, batchIds: [] });
  return list;
}

export function pendencyHref(p: Pendency): string {
  if (p.kind === 'cobranca') return '/painel/clientes?situacao=em_atraso';
  if (!p.step) return `/painel/crm?caixa=${p.kind}`;
  return p.batchIds.length === 1 ? `/painel/batches/${p.batchIds[0]}/${p.step}` : `/painel/batches?etapa=${p.step}`;
}
