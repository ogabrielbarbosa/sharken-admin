import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidTransitionError, stepOf, type LeadStage } from '../src/stages';

const allowed: [LeadStage, LeadStage][] = [
  ['analisando', 'revisar'],
  ['revisar', 'completar'],
  ['completar', 'gerando_material'],
  ['gerando_material', 'revisar_material'],
  ['revisar_material', 'gerando_material'],
  ['revisar_material', 'crm'],
  ['crm', 'vendido'],
  ['crm', 'sem_interesse'],
  ['sem_interesse', 'crm'],
  ['analisando', 'descartado'],
  ['completar', 'descartado'],
  ['crm', 'nao_contatar'],
  ['vendido', 'nao_contatar'],
  ['descartado', 'nao_contatar'],
  ['sem_interesse', 'nao_contatar'],
];

const forbidden: [LeadStage, LeadStage][] = [
  ['revisar', 'gerando_material'],
  ['revisar', 'crm'],
  ['crm', 'crm'],
  ['nao_contatar', 'revisar'],
  ['nao_contatar', 'descartado'],
  ['vendido', 'descartado'],
];

describe('transições', () => {
  it.each(allowed)('permite %s → %s', (from, to) => expect(canTransition(from, to)).toBe(true));
  it.each(forbidden)('proíbe %s → %s', (from, to) => expect(canTransition(from, to)).toBe(false));

  it('lança erro próprio em transição inválida', () => {
    expect(() => assertTransition('revisar', 'crm')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('revisar', 'completar')).not.toThrow();
  });
});

describe('stepOf', () => {
  it('agrupa os estados por etapa', () => {
    expect(stepOf('revisar')).toBe('revisar');
    expect(stepOf('completar')).toBe('completar');
    expect(stepOf('gerando_material')).toBe('material');
    expect(stepOf('revisar_material')).toBe('material');
  });

  it('não coloca análise nem saídas em nenhuma etapa', () => {
    expect(stepOf('analisando')).toBeNull();
    expect(stepOf('descartado')).toBeNull();
    expect(stepOf('nao_contatar')).toBeNull();
    expect(stepOf('crm')).toBeNull();
  });
});
