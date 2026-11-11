import { expect, it } from 'vitest';
import { looksLikeStopRequest } from '../src/stop-words';

it('detecta pedidos para parar', () => {
  expect(looksLikeStopRequest('Pode PARAR de mandar mensagem')).toBe(true);
  expect(looksLikeStopRequest('não tenho interesse')).toBe(true);
  expect(looksLikeStopRequest('Nao quero, obrigado')).toBe(true);
  expect(looksLikeStopRequest('Favor remover meu número')).toBe(true);
});
it('não confunde com palavras parecidas', () => {
  expect(looksLikeStopRequest('quero sim')).toBe(false);
  expect(looksLikeStopRequest('vou reparar o site, pode mandar')).toBe(false);
  expect(looksLikeStopRequest('')).toBe(false);
});
