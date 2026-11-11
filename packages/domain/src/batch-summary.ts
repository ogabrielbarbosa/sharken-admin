import { PROCESS_STEPS, stepOf, type LeadStage, type ProcessStep } from './stages';

export type BatchSummary = { counts: Record<ProcessStep, number>; crm: number; nextAction: string | null };

export function summarizeBatch(leads: { stage: LeadStage }[]): BatchSummary {
  const counts = Object.fromEntries(PROCESS_STEPS.map((s) => [s.key, 0])) as Record<ProcessStep, number>;
  const stages: Partial<Record<LeadStage, number>> = {};
  for (const { stage } of leads) {
    const step = stepOf(stage);
    if (step) counts[step] += 1;
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  const actions: [number, (n: number) => string][] = [
    [stages.revisar ?? 0, (n) => (n === 1 ? '1 lead para avaliar' : `${n} leads para avaliar`)],
    [stages.completar ?? 0, (n) => `${n} para completar`],
    [stages.revisar_material ?? 0, (n) => `${n} para aprovar`],
    [stages.crm ?? 0, (n) => `${n} no CRM`],
  ];
  const next = actions.find(([n]) => n > 0);
  return { counts, crm: stages.crm ?? 0, nextAction: next ? next[1](next[0]) : null };
}
