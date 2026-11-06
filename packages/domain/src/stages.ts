export type LeadStage =
  | 'analisando' | 'revisar' | 'gerando_material' | 'revisar_material' | 'abordar'
  | 'aguardando' | 'follow_up_feito' | 'conversa' | 'vendido'
  | 'descartado' | 'sem_interesse' | 'nao_contatar';

export type ProcessStep = 'revisar' | 'material' | 'abordar' | 'aguardar' | 'conversa' | 'vendido';

export const PROCESS_STEPS: { key: ProcessStep; label: string }[] = [
  { key: 'revisar', label: 'Revisar' },
  { key: 'material', label: 'Material' },
  { key: 'abordar', label: 'Abordar' },
  { key: 'aguardar', label: 'Aguardar' },
  { key: 'conversa', label: 'Conversa' },
  { key: 'vendido', label: 'Vendido' },
];

const STAGE_STEP: Partial<Record<LeadStage, ProcessStep>> = {
  revisar: 'revisar',
  gerando_material: 'material',
  revisar_material: 'material',
  abordar: 'abordar',
  aguardando: 'aguardar',
  follow_up_feito: 'aguardar',
  conversa: 'conversa',
  vendido: 'vendido',
};

export function stepOf(stage: LeadStage): ProcessStep | null {
  return STAGE_STEP[stage] ?? null;
}

export function stagesOf(step: ProcessStep): LeadStage[] {
  return (Object.keys(STAGE_STEP) as LeadStage[]).filter((s) => STAGE_STEP[s] === step);
}

const NEXT: Partial<Record<LeadStage, LeadStage[]>> = {
  analisando: ['revisar'],
  revisar: ['gerando_material'],
  gerando_material: ['revisar_material'],
  revisar_material: ['gerando_material', 'abordar'],
  abordar: ['aguardando'],
  aguardando: ['follow_up_feito', 'conversa'],
  follow_up_feito: ['conversa'],
  conversa: ['vendido', 'sem_interesse'],
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
