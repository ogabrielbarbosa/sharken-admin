import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APIFY_TOKEN: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  CAPTURE_TOKEN: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  ANTHROPIC_WORKSPACE_ID: z.string().optional(),
  COMMERCIAL_NAME: z.string().default('Sharken'),
  WEBHOOK_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

type Source = Record<string, string | undefined>;

export function getEnv(source: Source = process.env): Env {
  // Linhas como `CHAVE=` no arquivo chegam como texto vazio: valem como não preenchidas.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variáveis de ambiente ausentes ou inválidas: ${names}`);
  }
  return parsed.data;
}

/** Serviços externos não alcançam localhost: em ambiente local, use a URL de um túnel. */
export function webhookBaseUrl(env: Pick<Env, 'APP_URL' | 'WEBHOOK_BASE_URL'>): string {
  return env.WEBHOOK_BASE_URL ?? env.APP_URL;
}

export type OptionalKey =
  | 'ELEVENLABS_API_KEY'
  | 'ELEVENLABS_VOICE_ID'
  | 'PEXELS_API_KEY'
  | 'ZAPSIGN_API_TOKEN'
  | 'ZAPSIGN_TEMPLATE_ID'
  | 'ZAPSIGN_BASE_URL'
  | 'ASAAS_API_KEY'
  | 'ASAAS_BASE_URL';

export function requireOptional(key: OptionalKey, source: Source = process.env): string {
  const value = source[key];
  if (!value) throw new Error(`Configure a variável ${key} para usar este serviço.`);
  return value;
}
