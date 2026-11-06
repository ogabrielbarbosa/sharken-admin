import { expect, it } from 'vitest';
import { daysBetween, startOfTodayBrazil } from '@/lib/dates';

it('calcula o início do dia no horário de Brasília', () => {
  expect(startOfTodayBrazil(new Date('2026-11-06T02:00:00Z')).toISOString()).toBe('2026-11-05T03:00:00.000Z');
  expect(startOfTodayBrazil(new Date('2026-11-06T12:00:00Z')).toISOString()).toBe('2026-11-06T03:00:00.000Z');
});
it('conta dias completos', () => {
  expect(daysBetween('2026-11-01T12:00:00Z', new Date('2026-11-04T11:00:00Z'))).toBe(2);
});
