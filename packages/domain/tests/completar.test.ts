import { expect, it } from 'vitest';
import { canGenerateMaterial } from '../src/completar';

it('bloqueia melhorar site sem motivo', () => {
  expect(canGenerateMaterial({ flow: 'melhorar_site', reason: '' }, [])).toEqual({ ok: false, reason: 'Preencha o motivo para gerar o material.' });
  expect(canGenerateMaterial({ flow: 'melhorar_site', reason: null }, [])).toMatchObject({ ok: false });
  expect(canGenerateMaterial({ flow: 'melhorar_site', reason: '   ' }, [])).toMatchObject({ ok: false });
});
it('libera melhorar site com motivo', () => {
  expect(canGenerateMaterial({ flow: 'melhorar_site', reason: 'site lento' }, [])).toEqual({ ok: true });
});
it('libera sem site sem motivo, mesmo com itens extraindo', () => {
  expect(canGenerateMaterial({ flow: 'sem_site', reason: null }, [{ status: 'extraindo' }])).toEqual({ ok: true });
});

import { isAcceptedMime, normalizeLinkUrl, sanitizeFileName } from '../src/completar';

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
