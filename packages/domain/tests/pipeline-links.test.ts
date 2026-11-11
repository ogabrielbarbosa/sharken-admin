import { describe, expect, it } from 'vitest';
import { parseLoomUrl, parsePageUrl } from '../src/pipeline-links';

describe('parsePageUrl', () => {
  it('normaliza e exige https', () => {
    expect(parsePageUrl(' meusite.com.br ')).toBe('https://meusite.com.br/');
    expect(parsePageUrl('http://a.com/x')).toBe('https://a.com/x');
    expect(parsePageUrl('https://a.com/x')).toBe('https://a.com/x');
  });
  it('recusa o que não é página', () => {
    expect(parsePageUrl('nada')).toBeNull();
    expect(parsePageUrl('ftp://a.com')).toBeNull();
    expect(parsePageUrl('')).toBeNull();
  });
});

describe('parseLoomUrl', () => {
  it('devolve o link canônico, sem query', () => {
    expect(parseLoomUrl('https://www.loom.com/share/abc123?sid=x')).toBe('https://www.loom.com/share/abc123');
    expect(parseLoomUrl('loom.com/share/abc123')).toBe('https://www.loom.com/share/abc123');
    expect(parseLoomUrl(' https://loom.com/share/abc123 ')).toBe('https://www.loom.com/share/abc123');
  });
  it('recusa outros formatos e sites', () => {
    expect(parseLoomUrl('https://loom.com/embed/abc')).toBeNull();
    expect(parseLoomUrl('https://youtube.com/watch?v=1')).toBeNull();
    expect(parseLoomUrl('https://evil.com/loom.com/share/abc')).toBeNull();
    expect(parseLoomUrl('https://loom.com/share/')).toBeNull();
  });
});
