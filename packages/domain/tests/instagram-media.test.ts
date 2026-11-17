import { describe, expect, it } from 'vitest';
import { instagramMediaKey, pickInstagramMedia } from '../src/instagram-media';

describe('pickInstagramMedia', () => {
  it('pega a foto de perfil HD, todas as do carrossel e a capa do vídeo', () => {
    const out = pickInstagramMedia({
      profilePicUrlHD: 'https://cdn/perfil-hd.jpg',
      profilePicUrl: 'https://cdn/perfil.jpg',
      latestPosts: [
        { type: 'Image', url: 'https://instagram.com/p/a', caption: ' Bolo ', timestamp: '2026-11-01T10:00:00.000Z', displayUrl: 'https://cdn/a.jpg' },
        { type: 'Sidecar', url: 'https://instagram.com/p/b', displayUrl: 'https://cdn/b1.jpg', images: ['https://cdn/b1.jpg', 'https://cdn/b2.jpg'] },
        { type: 'Video', url: 'https://instagram.com/p/c', displayUrl: 'https://cdn/c-capa.jpg' },
      ],
    });
    expect(out.map((m) => [m.kind, m.source])).toEqual([
      ['perfil', 'https://cdn/perfil-hd.jpg'],
      ['post', 'https://cdn/a.jpg'],
      ['post', 'https://cdn/b1.jpg'],
      ['post', 'https://cdn/b2.jpg'],
      ['post', 'https://cdn/c-capa.jpg'],
    ]);
    expect(out[1]).toMatchObject({ post_url: 'https://instagram.com/p/a', caption: 'Bolo', taken_at: '2026-11-01T10:00:00.000Z' });
  });

  it('usa os childPosts quando o carrossel não traz images e cai na foto comum sem HD', () => {
    const out = pickInstagramMedia({
      profilePicUrl: 'https://cdn/p.jpg',
      latestPosts: [{ type: 'Sidecar', displayUrl: 'https://cdn/x.jpg', childPosts: [{ displayUrl: 'https://cdn/x1.jpg' }, { displayUrl: 'https://cdn/x2.jpg' }] }],
    });
    expect(out.map((m) => m.source)).toEqual(['https://cdn/p.jpg', 'https://cdn/x1.jpg', 'https://cdn/x2.jpg']);
  });

  it('limita a 12 posts e ignora links vazios ou inválidos', () => {
    const posts = Array.from({ length: 15 }, (_, i) => ({ type: 'Image', displayUrl: `https://cdn/${i}.jpg` }));
    const out = pickInstagramMedia({ profilePicUrlHD: null, latestPosts: [{ type: 'Image', displayUrl: 'javascript:x' }, ...posts] });
    expect(out).toHaveLength(11);
    expect(out.every((m) => m.kind === 'post')).toBe(true);
  });

  it('perfil sem nada devolve lista vazia', () => {
    expect(pickInstagramMedia({})).toEqual([]);
  });
});

describe('instagramMediaKey', () => {
  it('monta o caminho por lead, com extensão pelo tipo', () => {
    expect(instagramMediaKey('L1', { kind: 'perfil' }, 0, 'image/jpeg')).toBe('leads/L1/instagram/perfil.jpg');
    expect(instagramMediaKey('L1', { kind: 'post' }, 3, 'image/webp; q=1')).toBe('leads/L1/instagram/post-03.webp');
    expect(instagramMediaKey('L1', { kind: 'post' }, 12, null)).toBe('leads/L1/instagram/post-12.jpg');
  });
});
