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
  // Descartado volta ao quadro; a página e o vídeo só com o que a etapa pede (`restoreLead`).
  descartado: ['revisar', 'completar', 'pagina', 'video'],
};

const FINAL: LeadStage[] = ['vendido', 'descartado', 'sem_interesse', 'nao_contatar'];

export function canTransition(from: LeadStage, to: LeadStage): boolean {
  if (from === 'nao_contatar') return false;
  if (to === 'nao_contatar') return true;
  if (to === 'descartado') return !FINAL.includes(from);
  return NEXT[from]?.includes(to) ?? false;
}

/**
 * O que acontece ao soltar um cartão numa coluna do quadro. Só vale uma etapa para a frente ou para trás (um descartado volta até Vídeo):
 * `qualificar`/`completar`/`voltar`/`descartar`/`restaurar` rodam a ação da etapa; `abrir` abre o modal do lead,
 * porque Página → Vídeo e Vídeo → Pronto precisam de um link. `null`: a coluna não aceita o cartão.
 */
export type DropMove = 'qualificar' | 'completar' | 'abrir' | 'voltar' | 'descartar' | 'restaurar';

const DROPS: Partial<Record<LeadStage, Partial<Record<PipelineColumn, DropMove>>>> = {
  revisar: { qualificado: 'qualificar' },
  completar: { pagina: 'completar' },
  pagina: { video: 'abrir', qualificado: 'voltar' },
  video: { pronto: 'abrir', pagina: 'voltar' },
  descartado: { novo: 'restaurar', qualificado: 'restaurar', pagina: 'restaurar', video: 'restaurar' },
};

export function dropMove(stage: LeadStage, column: PipelineColumn): DropMove | null {
  if (column === 'descartados') return canTransition(stage, 'descartado') ? 'descartar' : null;
  return DROPS[stage]?.[column] ?? null;
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
