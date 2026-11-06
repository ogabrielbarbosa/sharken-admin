import { describe, expect, it } from 'vitest';
import { getEnv, requireOptional } from '../src/env';

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
