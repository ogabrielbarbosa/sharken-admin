import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidTransitionError, stepOf, type LeadStage } from '../src/stages';

const allowed: [LeadStage, LeadStage][] = [
  ['analisando', 'revisar'],
  ['revisar', 'gerando_material'],
  ['gerando_material', 'revisar_material'],
  ['revisar_material', 'gerando_material'],
  ['revisar_material', 'abordar'],
  ['abordar', 'aguardando'],
  ['aguardando', 'follow_up_feito'],
  ['aguardando', 'conversa'],
  ['follow_up_feito', 'conversa'],
  ['conversa', 'vendido'],
  ['conversa', 'sem_interesse'],
  ['analisando', 'descartado'],
  ['abordar', 'descartado'],
  ['conversa', 'nao_contatar'],
  ['vendido', 'nao_contatar'],
  ['descartado', 'nao_contatar'],
  ['sem_interesse', 'nao_contatar'],
];

const forbidden: [LeadStage, LeadStage][] = [
  ['follow_up_feito', 'follow_up_feito'],
  ['aguardando', 'vendido'],
  ['revisar', 'abordar'],
  ['nao_contatar', 'revisar'],
  ['nao_contatar', 'descartado'],
  ['vendido', 'descartado'],
];

describe('transições', () => {
  it.each(allowed)('permite %s → %s', (from, to) => expect(canTransition(from, to)).toBe(true));
  it.each(forbidden)('proíbe %s → %s', (from, to) => expect(canTransition(from, to)).toBe(false));

  it('lança erro próprio em transição inválida', () => {
    expect(() => assertTransition('aguardando', 'vendido')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('abordar', 'aguardando')).not.toThrow();
  });
});

describe('stepOf', () => {
  it('agrupa os estados de material e de espera', () => {
    expect(stepOf('gerando_material')).toBe('material');
    expect(stepOf('revisar_material')).toBe('material');
    expect(stepOf('aguardando')).toBe('aguardar');
    expect(stepOf('follow_up_feito')).toBe('aguardar');
  });

  it('não coloca análise nem saídas em nenhuma etapa', () => {
    expect(stepOf('analisando')).toBeNull();
    expect(stepOf('descartado')).toBeNull();
    expect(stepOf('nao_contatar')).toBeNull();
  });
});
