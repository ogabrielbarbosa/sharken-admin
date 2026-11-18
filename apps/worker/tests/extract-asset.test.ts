import { describe, expect, it } from 'vitest';
import { APIFY_NOT_CONNECTED, APIFY_OUT_OF_CREDIT } from '@lps/integrations';
import { friendlyError, isHttpUrl } from '../src/jobs/extract-asset';

describe('isHttpUrl', () => {
  it('aceita http e https', () => {
    expect(isHttpUrl('https://exemplo.com/a')).toBe(true);
    expect(isHttpUrl('http://exemplo.com')).toBe(true);
  });
  it('recusa outros esquemas e lixo', () => {
    for (const u of ['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'ftp://x.com', 'sem esquema', '']) {
      expect(isHttpUrl(u)).toBe(false);
    }
  });
});

describe('friendlyError', () => {
  it('mantém os avisos do Apify como estão', () => {
    expect(friendlyError(APIFY_NOT_CONNECTED)).toBe(APIFY_NOT_CONNECTED);
    expect(friendlyError(APIFY_OUT_OF_CREDIT)).toBe(APIFY_OUT_OF_CREDIT);
  });
  it('outros erros do Apify continuam genéricos', () => {
    expect(friendlyError('O Apify recusou a leitura (500).')).toBe('Não consegui ler o perfil do Instagram.');
  });
});
