import { expect, it } from 'vitest';
import { phoneMatchCandidates, toMobileE164 } from '../src/phone';

it('normaliza celular com e sem DDI', () => {
  expect(toMobileE164('(11) 98765-4321')).toBe('5511987654321');
  expect(toMobileE164('+55 11 98765-4321')).toBe('5511987654321');
});
it('recusa fixo, 0800 e vazio', () => {
  expect(toMobileE164('(11) 3456-7890')).toBeNull();
  expect(toMobileE164('0800 123 4567')).toBeNull();
  expect(toMobileE164(null)).toBeNull();
});

it('candidatos com e sem o nono dígito, com e sem o +', () => {
  const a = phoneMatchCandidates('+5519981342207');
  expect(a.sort()).toEqual(['+551981342207', '+5519981342207', '551981342207', '5519981342207']);
  expect(phoneMatchCandidates('551981342207').sort()).toEqual(a);
});
it('número estrangeiro só ele mesmo, com e sem o +', () => {
  expect(phoneMatchCandidates('+14155550123').sort()).toEqual(['+14155550123', '14155550123']);
});
