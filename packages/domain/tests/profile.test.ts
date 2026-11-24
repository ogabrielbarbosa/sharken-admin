import { describe, expect, it } from 'vitest';
import { avatarMime, parseProfileName } from '../src/profile';

describe('perfil', () => {
  it('apara o nome e recusa curto ou longo', () => {
    expect(parseProfileName('  Ana Lima ')).toBe('Ana Lima');
    expect(() => parseProfileName('A')).toThrow('O nome precisa ter entre 2 e 80 caracteres.');
    expect(() => parseProfileName('a'.repeat(81))).toThrow('O nome precisa ter entre 2 e 80 caracteres.');
  });
  it('reconhece a imagem pelos bytes, não pelo nome', () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(avatarMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(avatarMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(avatarMime(text('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(avatarMime(text('<svg xmlns="x">'))).toBeNull();
    expect(avatarMime(new Uint8Array())).toBeNull();
  });
});
