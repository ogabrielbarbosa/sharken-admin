import { describe, expect, it } from 'vitest';
import { r2Config, r2ObjectUrl, r2PublicUrl } from '../src/r2';

const env = { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'sharken-media', R2_PUBLIC_URL: 'https://media.exemplo.com/' };

describe('r2', () => {
  it('lê a configuração e tira a barra do fim do link público', () => {
    expect(r2Config(env).publicUrl).toBe('https://media.exemplo.com');
  });
  it('avisa quais variáveis faltam', () => {
    expect(() => r2Config({ ...env, R2_BUCKET: '', R2_PUBLIC_URL: undefined })).toThrow('R2_BUCKET, R2_PUBLIC_URL');
  });
  it('monta os links do objeto e o público', () => {
    const c = r2Config(env);
    expect(r2ObjectUrl(c, 'leads/L1/instagram/perfil.jpg')).toBe('https://acc.r2.cloudflarestorage.com/sharken-media/leads/L1/instagram/perfil.jpg');
    expect(r2PublicUrl(c, 'leads/L1/instagram/post-01.jpg')).toBe('https://media.exemplo.com/leads/L1/instagram/post-01.jpg');
  });
});
