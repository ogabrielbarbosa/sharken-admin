export type LeadStage =
  | 'analisando' | 'revisar' | 'completar' | 'pagina' | 'video' | 'crm'
  | 'vendido' | 'descartado' | 'sem_interesse' | 'nao_contatar';

export type PipelineColumn = 'novo' | 'qualificado' | 'pagina' | 'video' | 'pronto' | 'descartados';

export const PIPELINE_COLUMNS: { key: PipelineColumn; label: string; stages: LeadStage[] }[] = [
  { key: 'novo', label: 'Novo lead', stages: ['analisando', 'revisar'] },
  { key: 'qualificado', label: 'Qualificado', stages: ['completar'] },
  { key: 'pagina', label: 'Página', stages: ['pagina'] },
  { key: 'video', label: 'Vídeo', stages: ['video'] },
  { key: 'pronto', label: 'Pronto para abordar', stages: ['crm', 'vendido', 'sem_interesse'] },
  { key: 'descartados', label: 'Descartados', stages: ['descartado', 'nao_contatar'] },
];

export function columnOf(stage: LeadStage): PipelineColumn {
  return PIPELINE_COLUMNS.find((c) => c.stages.includes(stage))!.key;
}

const NEXT: Partial<Record<LeadStage, LeadStage[]>> = {
  analisando: ['revisar'],
  revisar: ['completar'],
  completar: ['pagina'],
  pagina: ['video', 'completar'],
  video: ['crm', 'pagina'],
  crm: ['vendido', 'sem_interesse'],
  // O contato perdido que volta a falar reabre o lead.
  sem_interesse: ['crm'],
};

const FINAL: LeadStage[] = ['vendido', 'descartado', 'sem_interesse', 'nao_contatar'];

export function canTransition(from: LeadStage, to: LeadStage): boolean {
  if (from === 'nao_contatar') return false;
  if (to === 'nao_contatar') return true;
  if (to === 'descartado') return !FINAL.includes(from);
  return NEXT[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(from: LeadStage, to: LeadStage) {
    super(`Transição inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: LeadStage, to: LeadStage): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
