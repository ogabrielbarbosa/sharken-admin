import { describe, expect, it } from 'vitest';
import { daysUntil, fillPaymentMessage, formatDueDate, paidAtOf, toAsaasCycle } from '../src/payments';

describe('toAsaasCycle', () => {
  it('mapeia a periodicidade em português para o código do Asaas', () => {
    expect(toAsaasCycle('mensal')).toBe('MONTHLY');
    expect(toAsaasCycle('trimestral')).toBe('QUARTERLY');
    expect(toAsaasCycle('semestral')).toBe('SEMIANNUALLY');
    expect(toAsaasCycle('anual')).toBe('YEARLY');
  });
  it('sem valor conhecido, mensal', () => {
    expect(toAsaasCycle(null)).toBe('MONTHLY');
    expect(toAsaasCycle('quinzenal')).toBe('MONTHLY');
  });
});

describe('datas', () => {
  it('formata dd/mm/aaaa sem deslocar o dia', () => expect(formatDueDate('2026-11-20')).toBe('20/11/2026'));
  it('conta dias, negativo quando passou', () => {
    expect(daysUntil('2026-11-15', '2026-11-11')).toBe(4);
    expect(daysUntil('2026-11-08', '2026-11-11')).toBe(-3);
  });
});

describe('paidAtOf', () => {
  const now = new Date('2026-11-11T15:00:00Z');
  it('usa paymentDate, depois confirmedDate', () => {
    expect(paidAtOf({ paymentDate: '2026-11-06', confirmedDate: '2026-11-05' }, now)).toBe('2026-11-06T15:00:00.000Z');
    expect(paidAtOf({ confirmedDate: '2026-11-05' }, now)).toBe('2026-11-05T15:00:00.000Z');
  });
  it('sem data, usa agora', () => {
    expect(paidAtOf({}, now)).toBe(now.toISOString());
    expect(paidAtOf({ paymentDate: 'lixo' }, now)).toBe(now.toISOString());
  });
});

describe('fillPaymentMessage', () => {
  it('preenche todos os marcadores', () => {
    const t = 'Segue o link para pagamento de [descrição], no valor de [valor], com vencimento em [data]: [link]';
    expect(fillPaymentMessage(t, { description: 'Site', value: 'R$ 1.500,00', dueDate: '2026-11-20', link: 'https://x.com/i/1?a=$&' }))
      .toBe('Segue o link para pagamento de Site, no valor de R$ 1.500,00, com vencimento em 20/11/2026: https://x.com/i/1?a=$&');
  });
});
