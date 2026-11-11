import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, columnOf, InvalidTransitionError, PIPELINE_COLUMNS, type LeadStage } from '../src/stages';

const allowed: [LeadStage, LeadStage][] = [
  ['analisando', 'revisar'],
  ['revisar', 'completar'],
  ['completar', 'pagina'],
  ['pagina', 'video'],
  ['pagina', 'completar'],
  ['video', 'crm'],
  ['video', 'pagina'],
  ['pagina', 'descartado'],
  ['video', 'descartado'],
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
  ['revisar', 'crm'],
  ['completar', 'video'],
  ['completar', 'crm'],
  ['pagina', 'crm'],
  ['crm', 'video'],
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

describe('colunas', () => {
  it('leva cada estado à sua coluna', () => {
    expect(columnOf('analisando')).toBe('novo');
    expect(columnOf('revisar')).toBe('novo');
    expect(columnOf('completar')).toBe('qualificado');
    expect(columnOf('pagina')).toBe('pagina');
    expect(columnOf('video')).toBe('video');
    expect(columnOf('crm')).toBe('pronto');
    expect(columnOf('vendido')).toBe('pronto');
    expect(columnOf('sem_interesse')).toBe('pronto');
    expect(columnOf('descartado')).toBe('descartados');
    expect(columnOf('nao_contatar')).toBe('descartados');
  });

  it('usa os rótulos da spec, na ordem', () => {
    expect(PIPELINE_COLUMNS.map((c) => c.label)).toEqual(['Novo lead', 'Qualificado', 'Página', 'Vídeo', 'Pronto para abordar', 'Descartados']);
    expect(PIPELINE_COLUMNS.map((c) => c.key)).toEqual(['novo', 'qualificado', 'pagina', 'video', 'pronto', 'descartados']);
  });

  it('põe cada estado em uma única coluna', () => {
    const all = PIPELINE_COLUMNS.flatMap((c) => c.stages);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(
      ['analisando', 'revisar', 'completar', 'pagina', 'video', 'crm', 'vendido', 'descartado', 'sem_interesse', 'nao_contatar'].sort(),
    );
  });
});
