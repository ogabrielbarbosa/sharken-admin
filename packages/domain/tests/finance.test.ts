import { describe, expect, it } from 'vitest';
import { clientStanding, formatBRL, parseBRLToCents, summarizeCharges } from '../src/finance';

const charges = [
  { amount_cents: 60000, status: 'pago' },
  { amount_cents: 60000, status: 'pendente' },
  { amount_cents: 25000, status: 'vencido' },
  { amount_cents: 8900, status: 'pendente' },
  { amount_cents: 35000, status: 'cancelado' },
] as const;

describe('finanças', () => {
  it('bate com os números da tela de cliente', () => {
    expect(summarizeCharges([...charges])).toEqual({ invoiced: 153900, received: 60000, open: 93900, overdue: 25000 });
  });
  it('marca atraso quando há cobrança vencida', () => {
    expect(clientStanding([...charges])).toBe('em_atraso');
    expect(clientStanding([{ amount_cents: 1, status: 'pendente' }])).toBe('em_dia');
  });
  it('formata em reais', () => {
    expect(formatBRL(153900).replace(/\s/g, ' ')).toBe('R$ 1.539,00');
  });
  it('lê valores digitados em reais', () => {
    expect(parseBRLToCents('1.200,50')).toBe(120050);
    expect(parseBRLToCents('R$ 89')).toBe(8900);
    expect(parseBRLToCents('89.90')).toBe(8990);
    expect(parseBRLToCents('abc')).toBeNull();
  });
});
