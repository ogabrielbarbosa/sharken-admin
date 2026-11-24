import { expect, it } from 'vitest';
import { describeChange, parseMapsUrl, parseMobileInput } from '../src/lead-edit';

it('aceita só links de lugar do Google Maps', () => {
  for (const ok of ['https://maps.app.goo.gl/AbC', 'https://www.google.com/maps/place/X/@1,2', 'google.com.br/maps?cid=1', 'https://maps.google.com/?cid=12', 'https://goo.gl/maps/x', 'https://www.google.com/?cid=9', 'https://g.page/clinica']) expect(parseMapsUrl(ok), ok).toBeTruthy();
  for (const bad of ['https://google.com/search?q=x', 'https://evil.com/maps', 'https://google.com.evil.com/maps', 'https://goo.gl/x', 'texto solto']) expect(parseMapsUrl(bad), bad).toBeNull();
});
it('celular com e sem código do país', () => {
  expect(parseMobileInput('(12) 99999-0001')).toBe('5512999990001');
  expect(parseMobileInput('+1 512 472 5050')).toBe('15124725050');
  expect(parseMobileInput('512 472 5050', 'US')).toBe('15124725050');
});
it('descreve a mudança', () => {
  expect(describeChange({ campo: 'name', de: 'A', para: 'B' })).toBe('Nome: A → B');
  expect(describeChange({ campo: 'website_url', de: null, para: 'x.com' })).toBe('Site preenchido: x.com');
  expect(describeChange({ campo: 'batch', de: 'SJC', para: null })).toBe('Batch removido (era SJC)');
});
