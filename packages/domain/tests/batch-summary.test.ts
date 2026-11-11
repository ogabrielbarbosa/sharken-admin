import { describe, expect, it } from 'vitest';
import { summarizeBatch } from '../src/batch-summary';

describe('summarizeBatch', () => {
  it('conta por etapa e separa o CRM', () => {
    const r = summarizeBatch([{ stage: 'revisar' }, { stage: 'completar' }, { stage: 'crm' }]);
    expect(r.counts).toEqual({ revisar: 1, completar: 1, material: 0 });
    expect(r.crm).toBe(1);
    expect(r.nextAction).toBe('1 lead para avaliar');
  });
  it('plural e ordem das ações', () => {
    expect(summarizeBatch([{ stage: 'revisar' }, { stage: 'revisar' }]).nextAction).toBe('2 leads para avaliar');
    expect(summarizeBatch([{ stage: 'completar' }, { stage: 'crm' }]).nextAction).toBe('1 para completar');
    expect(summarizeBatch([{ stage: 'revisar_material' }, { stage: 'crm' }]).nextAction).toBe('1 para aprovar');
    expect(summarizeBatch([{ stage: 'crm' }, { stage: 'crm' }]).nextAction).toBe('2 no CRM');
    expect(summarizeBatch([]).nextAction).toBeNull();
  });
});
