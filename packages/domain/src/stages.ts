export type LeadStage =
  | 'analisando' | 'revisar' | 'completar' | 'gerando_material' | 'revisar_material' | 'crm'
  | 'vendido' | 'descartado' | 'sem_interesse' | 'nao_contatar';

export type ProcessStep = 'revisar' | 'completar' | 'material';

export const PROCESS_STEPS: { key: ProcessStep; label: string }[] = [
  { key: 'revisar', label: 'Leads' },
  { key: 'completar', label: 'Completar' },
  { key: 'material', label: 'Material' },
];

const STAGE_STEP: Partial<Record<LeadStage, ProcessStep>> = {
  revisar: 'revisar',
  completar: 'completar',
  gerando_material: 'material',
  revisar_material: 'material',
};

export function stepOf(stage: LeadStage): ProcessStep | null {
  return STAGE_STEP[stage] ?? null;
}

export function stagesOf(step: ProcessStep): LeadStage[] {
  return (Object.keys(STAGE_STEP) as LeadStage[]).filter((s) => STAGE_STEP[s] === step);
}

const NEXT: Partial<Record<LeadStage, LeadStage[]>> = {
  analisando: ['revisar'],
  revisar: ['completar'],
  completar: ['gerando_material'],
  gerando_material: ['revisar_material'],
  revisar_material: ['gerando_material', 'crm'],
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
