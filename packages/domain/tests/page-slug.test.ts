import { describe, expect, it } from 'vitest';
import { siteSlug } from '../src/page-slug';

describe('siteSlug', () => {
  it('simplifica o nome e junta o sufixo', () => {
    expect(siteSlug('Clínica Dr. João & Filhos', () => 'x7k2')).toBe('clinica-dr-joao-filhos-x7k2');
  });
  it('limita o nome a 48 caracteres sem hífen sobrando', () => {
    const slug = siteSlug('a'.repeat(30) + ' ' + 'b'.repeat(40), () => 'x7k2');
    const base = slug.slice(0, -5);
    expect(base.length).toBeLessThanOrEqual(48);
    expect(base.endsWith('-')).toBe(false);
    expect(slug.endsWith('-x7k2')).toBe(true);
  });
  it('funciona com nome sem letras', () => {
    expect(siteSlug('!!!', () => 'x7k2')).toBe('pagina-x7k2');
  });
});
