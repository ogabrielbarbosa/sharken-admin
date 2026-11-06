import { expect, it } from 'vitest';
import { expiryFrom, isMaterialReady, needsStockPhotos, newSiteSlug } from '../src/material';

it('gera códigos longos, seguros para URL e diferentes', () => {
  const a = newSiteSlug();
  expect(a).toMatch(/^[A-Za-z0-9_-]{22,}$/);
  expect(a).not.toBe(newSiteSlug());
});
it('expira em 30 dias', () => {
  expect(expiryFrom(new Date('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
});
it('considera o material pronto conforme o vídeo', () => {
  expect(isMaterialReady({ siteReady: true, videoEnabled: false, videoStatus: null })).toBe(true);
  expect(isMaterialReady({ siteReady: true, videoEnabled: true, videoStatus: 'na_fila' })).toBe(false);
  expect(isMaterialReady({ siteReady: true, videoEnabled: true, videoStatus: 'pronto' })).toBe(true);
  expect(isMaterialReady({ siteReady: false, videoEnabled: false, videoStatus: null })).toBe(false);
});
it('pede imagens de banco com menos de 3 fotos', () => {
  expect(needsStockPhotos(['a', 'b'])).toBe(true);
  expect(needsStockPhotos(['a', 'b', 'c'])).toBe(false);
});
