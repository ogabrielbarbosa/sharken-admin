import { describe, expect, it } from 'vitest';
import { maskApifyToken, parseApifyToken } from '../src/apify-token';

describe('token do Apify', () => {
  it('limpa espaços e quebras de linha', () => {
    expect(parseApifyToken('  apify_api_abc \n')).toBe('apify_api_abc');
    expect(parseApifyToken('apify_api_\nabc')).toBe('apify_api_abc');
  });
  it('vazio é null', () => {
    expect(parseApifyToken('   ')).toBeNull();
  });
  it('mostra só os últimos 4', () => {
    expect(maskApifyToken('apify_api_abcd1234')).toBe('…1234');
    expect(maskApifyToken('abc')).toBe('••••');
  });
});
