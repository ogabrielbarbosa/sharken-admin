import { describe, expect, it } from 'vitest';
import { isHttpUrl } from '../src/jobs/extract-asset';

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
