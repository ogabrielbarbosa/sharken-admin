import { describe, expect, it } from 'vitest';
import { getEnv, isLocalUrl, requireOptional, webhookBaseUrl, whatsappWebhookUrl } from '../src/env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
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

describe('whatsappWebhookUrl', () => {
  const env = { APP_URL: 'http://localhost:3010' };

  it('monta a URL com o segredo', () => {
    expect(whatsappWebhookUrl({ APP_URL: 'https://app.dev' }, { WHATSAPP_WEBHOOK_SECRET: 's', EVOLUTION_URL: 'https://evo.dev' })).toBe('https://app.dev/api/webhooks/whatsapp?token=s');
  });

  it('sem segredo, não há webhook', () => {
    expect(whatsappWebhookUrl(env, { EVOLUTION_URL: 'http://localhost:8085' })).toBeNull();
  });

  it('nunca aponta uma Evolution remota para um endereço local (ela não alcança o Mac)', () => {
    expect(whatsappWebhookUrl(env, { WHATSAPP_WEBHOOK_SECRET: 's', EVOLUTION_URL: 'https://evo.dev' })).toBeNull();
  });

  it('Evolution remota com URL pública (túnel fixo) usa a URL pública', () => {
    expect(whatsappWebhookUrl(env, { WHATSAPP_WEBHOOK_SECRET: 's', EVOLUTION_URL: 'https://evo.dev', WHATSAPP_WEBHOOK_BASE_URL: 'https://t.dev/' })).toBe('https://t.dev/api/webhooks/whatsapp?token=s');
  });

  it('Evolution no Docker pode chamar host.docker.internal', () => {
    expect(whatsappWebhookUrl(env, { WHATSAPP_WEBHOOK_SECRET: 's', EVOLUTION_URL: 'http://localhost:8085', WHATSAPP_WEBHOOK_BASE_URL: 'http://host.docker.internal:3010' })).toBe('http://host.docker.internal:3010/api/webhooks/whatsapp?token=s');
  });
});

describe('isLocalUrl', () => {
  it('reconhece endereços locais', () => {
    for (const u of ['http://localhost:3010', 'http://127.0.0.1:8085', 'http://host.docker.internal:3010', 'http://0.0.0.0:1']) expect(isLocalUrl(u)).toBe(true);
    for (const u of ['https://evo.sharkenapps.com', 'https://abc.trycloudflare.com', 'https://localhost.dev']) expect(isLocalUrl(u)).toBe(false);
  });
});
