import { expect, it } from 'vitest';
import { toMobileE164 } from '../src/phone';

it('normaliza celular com e sem DDI', () => {
  expect(toMobileE164('(11) 98765-4321')).toBe('5511987654321');
  expect(toMobileE164('+55 11 98765-4321')).toBe('5511987654321');
});
it('recusa fixo, 0800 e vazio', () => {
  expect(toMobileE164('(11) 3456-7890')).toBeNull();
  expect(toMobileE164('0800 123 4567')).toBeNull();
  expect(toMobileE164(null)).toBeNull();
});
