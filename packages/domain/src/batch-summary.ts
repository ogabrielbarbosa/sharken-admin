import { PROCESS_STEPS, stepOf, type LeadStage, type ProcessStep } from './stages';

export type BatchSummary = { counts: Record<ProcessStep, number>; nextAction: string | null };

export function summarizeBatch(leads: { stage: LeadStage }[]): BatchSummary {
  const counts = Object.fromEntries(PROCESS_STEPS.map((s) => [s.key, 0])) as Record<ProcessStep, number>;
  const stages: Partial<Record<LeadStage, number>> = {};
  for (const { stage } of leads) {
    const step = stepOf(stage);
    if (step) counts[step] += 1;
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  const actions: [number, (n: number) => string][] = [
    [stages.revisar ?? 0, (n) => `${n} para revisar`],
    [stages.revisar_material ?? 0, (n) => `${n} para aprovar`],
    [stages.abordar ?? 0, (n) => `${n} para abordar`],
    [stages.conversa ?? 0, (n) => (n === 1 ? '1 resposta em Conversa' : `${n} respostas em Conversa`)],
  ];
  const next = actions.find(([n]) => n > 0);
  return { counts, nextAction: next ? next[1](next[0]) : null };
}
