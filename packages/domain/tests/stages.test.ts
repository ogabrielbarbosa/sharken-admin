import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, columnOf, dropMove, InvalidTransitionError, PIPELINE_COLUMNS, type LeadStage } from '../src/stages';

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

describe('dropMove', () => {
  it('liga cada etapa às colunas para onde o cartão pode ser arrastado', () => {
    expect(dropMove('revisar', 'qualificado')).toBe('qualificar');
    expect(dropMove('completar', 'pagina')).toBe('completar');
    expect(dropMove('pagina', 'video')).toBe('abrir');
    expect(dropMove('pagina', 'qualificado')).toBe('voltar');
    expect(dropMove('video', 'pronto')).toBe('abrir');
    expect(dropMove('video', 'pagina')).toBe('voltar');
    expect(dropMove('crm', 'descartados')).toBe('descartar');
    for (const c of ['novo', 'qualificado', 'pagina', 'video'] as const) expect(dropMove('descartado', c)).toBe('restaurar');
    expect(dropMove('descartado', 'pronto')).toBeNull();
    expect(dropMove('descartado', 'descartados')).toBeNull();
    expect(dropMove('nao_contatar', 'novo')).toBeNull();
  });

  it('não deixa pular etapa nem soltar na própria coluna', () => {
    expect(dropMove('revisar', 'pagina')).toBeNull();
    expect(dropMove('analisando', 'qualificado')).toBeNull();
    expect(dropMove('completar', 'video')).toBeNull();
    expect(dropMove('video', 'qualificado')).toBeNull();
    expect(dropMove('crm', 'video')).toBeNull();
    expect(dropMove('pagina', 'pagina')).toBeNull();
    expect(dropMove('vendido', 'descartados')).toBeNull();
  });
});
