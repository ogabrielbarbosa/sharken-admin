import { describe, expect, it } from 'vitest';
import { createUrlCache } from '@/lib/media-cache';

describe('createUrlCache', () => {
  it('mantém a primeira URL enquanto vale', () => {
    const c = createUrlCache(1000);
    expect(c.resolve('a', 'u1', 0)).toBe('u1');
    expect(c.resolve('a', 'u2', 500)).toBe('u1');
  });
  it('troca depois do prazo', () => {
    const c = createUrlCache(1000);
    c.resolve('a', 'u1', 0);
    expect(c.resolve('a', 'u2', 1500)).toBe('u2');
  });
  it('sem URL nova nem cache devolve nulo', () => {
    expect(createUrlCache(1000).resolve('a', null, 0)).toBeNull();
  });
});
