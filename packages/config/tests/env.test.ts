import { describe, expect, it } from 'vitest';
import { getEnv, requireOptional, webhookBaseUrl } from '../src/env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  APIFY_TOKEN: 'apify',
  WEBHOOK_SECRET: 'secret',
  ANTHROPIC_API_KEY: 'claude',
  APP_URL: 'https://app.test',
  CAPTURE_TOKEN: 'capture',
  CRON_SECRET: 'cron',
};

describe('getEnv', () => {
  it('cita a variável ausente no erro', () => {
    const { ANTHROPIC_API_KEY: _omit, ...rest } = valid;
    expect(() => getEnv(rest)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('trata campo opcional vazio como ausente', () => {
    expect(getEnv({ ...valid, WEBHOOK_BASE_URL: '' }).WEBHOOK_BASE_URL).toBeUndefined();
    expect(getEnv({ ...valid, ANTHROPIC_MODEL: '', COMMERCIAL_NAME: '' }).ANTHROPIC_MODEL).toBe('claude-opus-5-5');
  });

  it('devolve os valores validados e aplica os padrões', () => {
    const env = getEnv(valid);
    expect(env.APIFY_TOKEN).toBe('apify');
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-5-5');
    expect(env.COMMERCIAL_NAME).toBe('Sharken');
  });
});

describe('requireOptional', () => {
  it('lança erro quando a chave do serviço falta', () => {
    expect(() => requireOptional('ZAPSIGN_API_TOKEN', {})).toThrow(/ZAPSIGN_API_TOKEN/);
  });

  it('devolve a chave quando existe', () => {
    expect(requireOptional('ZAPSIGN_API_TOKEN', { ZAPSIGN_API_TOKEN: 'z' })).toBe('z');
  });
});

describe('webhookBaseUrl', () => {
  it('prefere a URL do túnel', () => {
    expect(webhookBaseUrl({ APP_URL: 'http://localhost:3000', WEBHOOK_BASE_URL: 'https://t.dev' })).toBe('https://t.dev');
    expect(webhookBaseUrl({ APP_URL: 'https://app.dev' })).toBe('https://app.dev');
  });
});
