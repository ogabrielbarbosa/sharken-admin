import { describe, expect, it } from 'vitest';
import { summarizeBatch } from '../src/batch-summary';

describe('summarizeBatch', () => {
  it('conta por coluna e aponta a primeira ação', () => {
    const r = summarizeBatch(['revisar', 'revisar', 'completar', 'pagina', 'crm', 'descartado'].map((stage) => ({ stage })) as never);
    expect(r.counts).toEqual({ novo: 2, qualificado: 1, pagina: 1, video: 0, pronto: 1, descartados: 1 });
    expect(r.nextAction).toBe('2 leads para avaliar');
  });
  it('singular e ordem das ações', () => {
    expect(summarizeBatch([{ stage: 'revisar' }]).nextAction).toBe('1 lead para avaliar');
    expect(summarizeBatch([{ stage: 'completar' }, { stage: 'crm' }]).nextAction).toBe('1 para completar');
    expect(summarizeBatch([{ stage: 'pagina' }]).nextAction).toBe('1 sem página');
    expect(summarizeBatch([{ stage: 'video' }]).nextAction).toBe('1 sem Loom');
    expect(summarizeBatch([{ stage: 'video' }, { stage: 'crm' }]).nextAction).toBe('1 sem Loom');
    expect(summarizeBatch([{ stage: 'crm' }, { stage: 'crm' }]).nextAction).toBe('2 no CRM');
    expect(summarizeBatch([{ stage: 'vendido' }]).nextAction).toBeNull();
    expect(summarizeBatch([]).nextAction).toBeNull();
  });
});
