import { expect, it } from 'vitest';
import { canCompleteInfo, isAcceptedMime, nextPending, normalizeLinkUrl, sanitizeFileName } from '../src/completar';

it('recusa enquanto algum item está sendo extraído', () => {
  expect(canCompleteInfo({ flow: 'sem_site', reason: null }, [{ status: 'pronto' }, { status: 'extraindo' }])).toEqual({ ok: false, reason: 'Espere a extração terminar.' });
});
it('recusa melhorar site sem motivo', () => {
  expect(canCompleteInfo({ flow: 'melhorar_site', reason: '' }, [])).toEqual({ ok: false, reason: 'Preencha o motivo.' });
  expect(canCompleteInfo({ flow: 'melhorar_site', reason: null }, [])).toMatchObject({ ok: false });
  expect(canCompleteInfo({ flow: 'melhorar_site', reason: '   ' }, [])).toMatchObject({ ok: false });
});
it('libera melhorar site com motivo', () => {
  expect(canCompleteInfo({ flow: 'melhorar_site', reason: 'site lento' }, [])).toEqual({ ok: true });
});
it('libera sem site sem motivo, e item com erro não trava', () => {
  expect(canCompleteInfo({ flow: 'sem_site', reason: null }, [])).toEqual({ ok: true });
  expect(canCompleteInfo({ flow: 'sem_site', reason: null }, [{ status: 'erro' }, { status: 'pronto' }])).toEqual({ ok: true });
});

it('limpa o nome do arquivo', () => {
  expect(sanitizeFileName('Tabela de preços (2).pdf')).toBe('Tabela-de-precos-2-.pdf');
  expect(sanitizeFileName('../../x.pdf')).toBe('x.pdf');
});
it('normaliza links', () => {
  expect(normalizeLinkUrl('instagram.com/foco')).toBe('https://instagram.com/foco');
  expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
  expect(normalizeLinkUrl('duas palavras')).toBeNull();
});
it('aceita PDF, imagens e documentos', () => {
  expect(isAcceptedMime('image/png')).toBe(true);
  expect(isAcceptedMime('application/pdf')).toBe(true);
  expect(isAcceptedMime('application/zip')).toBe(false);
});

it('acha o próximo pendente dando a volta', () => {
  const pending = new Set(['a', 'c']);
  expect(nextPending(['a', 'b', 'c'], 'a', pending)).toBe('c');
  expect(nextPending(['a', 'b', 'c'], 'c', pending)).toBe('a');
  expect(nextPending(['a'], 'a', new Set(['a']))).toBeNull();
});
it('usa a lista de pendentes quando não há ids (fila vazia + atual)', () => {
  expect(nextPending([], 'x', new Set(['x']))).toBeNull();
  expect(nextPending(['x', 'y'], 'x', new Set(['x', 'y']))).toBe('y');
});
