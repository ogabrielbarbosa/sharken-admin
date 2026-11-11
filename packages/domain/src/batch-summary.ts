import { columnOf, PIPELINE_COLUMNS, type LeadStage, type PipelineColumn } from './stages';

export type BatchSummary = { counts: Record<PipelineColumn, number>; nextAction: string | null };

export function summarizeBatch(leads: { stage: LeadStage }[]): BatchSummary {
  const counts = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, 0])) as Record<PipelineColumn, number>;
  const stages: Partial<Record<LeadStage, number>> = {};
  for (const { stage } of leads) {
    counts[columnOf(stage)] += 1;
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  const actions: [number, (n: number) => string][] = [
    [stages.revisar ?? 0, (n) => (n === 1 ? '1 lead para avaliar' : `${n} leads para avaliar`)],
    [stages.completar ?? 0, (n) => `${n} para completar`],
    [stages.pagina ?? 0, (n) => `${n} sem página`],
    [stages.video ?? 0, (n) => `${n} sem Loom`],
    [stages.crm ?? 0, (n) => `${n} no CRM`],
  ];
  const next = actions.find(([n]) => n > 0);
  return { counts, nextAction: next ? next[1](next[0]) : null };
}
