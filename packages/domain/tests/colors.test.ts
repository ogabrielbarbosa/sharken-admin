import { expect, it } from 'vitest';
import { DEFAULT_PRIMARY, resolveColors } from '../src/colors';

it('usa texto escuro sobre cor clara e claro sobre cor escura', () => {
  expect(resolveColors('#ffffff')).toEqual({ primary: '#ffffff', onPrimary: '#111111' });
  expect(resolveColors('#000000')).toEqual({ primary: '#000000', onPrimary: '#ffffff' });
});
it('cai na cor padrão com valor inválido ou ausente', () => {
  expect(resolveColors('azul').primary).toBe(DEFAULT_PRIMARY);
  expect(resolveColors(null).primary).toBe(DEFAULT_PRIMARY);
  expect(resolveColors('red;background:url(x)').primary).toBe(DEFAULT_PRIMARY);
});
it('aceita o formato curto', () => {
  expect(resolveColors('#fff').primary).toBe('#ffffff');
});
