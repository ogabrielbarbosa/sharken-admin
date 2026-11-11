
// Conexões com APIs externas. As chaves continuam no .env; aqui só se lê se estão preenchidas.

export type ConnectionTone = 'success' | 'warning' | 'danger' | 'neutral';
export type ConnectionSlug = 'whatsapp' | 'anthropic' | 'apify' | 'zapsign' | 'asaas' | 'elevenlabs';

export type ConnectionDef = {
  slug: ConnectionSlug;
  label: string;
  provider: string;
  description: string;
  vars: { key: string; required: boolean; secret: boolean }[];
  docs: string;
};

export const CONNECTIONS: ConnectionDef[] = [
  {
    slug: 'whatsapp',
    label: 'WhatsApp',
    provider: 'Evolution API v2',
    description: 'Conversas do CRM: recebe e envia mensagens pelo número de prospecção.',
    vars: [
      { key: 'EVOLUTION_URL', required: true, secret: false },
      { key: 'EVOLUTION_API_KEY', required: true, secret: true },
      { key: 'EVOLUTION_INSTANCE', required: true, secret: false },
      { key: 'WHATSAPP_WEBHOOK_SECRET', required: true, secret: true },
      { key: 'WHATSAPP_WEBHOOK_BASE_URL', required: false, secret: false },
    ],
    docs: 'https://doc.evolution-api.com/v2/pt/get-started/introduction',
  },
  {
    slug: 'anthropic',
    label: 'Claude',
    provider: 'API da Anthropic',
    description: 'Análise dos leads, geração das páginas e sugestões de resposta.',
    vars: [
      { key: 'ANTHROPIC_API_KEY', required: true, secret: true },
      { key: 'ANTHROPIC_MODEL', required: false, secret: false },
    ],
    docs: 'https://docs.claude.com',
  },
  {
    slug: 'apify',
    label: 'Apify',
    provider: 'Google Maps scraper',
    description: 'Busca dos negócios de cada batch.',
    vars: [{ key: 'APIFY_TOKEN', required: true, secret: true }],
    docs: 'https://docs.apify.com/api/v2',
  },
  {
    slug: 'zapsign',
    label: 'ZapSign',
    provider: 'Assinatura de contratos',
    description: 'Contrato enviado ao fechar negócio.',
    vars: [
      { key: 'ZAPSIGN_API_TOKEN', required: true, secret: true },
      { key: 'ZAPSIGN_TEMPLATE_ID', required: true, secret: false },
      { key: 'ZAPSIGN_BASE_URL', required: false, secret: false },
    ],
    docs: 'https://docs.zapsign.com.br',
  },
  {
    slug: 'asaas',
    label: 'Asaas',
    provider: 'Cobranças',
    description: 'Cobranças dos serviços dos clientes.',
    vars: [
      { key: 'ASAAS_API_KEY', required: true, secret: true },
      { key: 'ASAAS_BASE_URL', required: false, secret: false },
    ],
    docs: 'https://docs.asaas.com',
  },
  {
    slug: 'elevenlabs',
    label: 'ElevenLabs',
    provider: 'Voz do vídeo por IA',
    description: 'Só usado com VIDEO_MODE=ia.',
    vars: [
      { key: 'ELEVENLABS_API_KEY', required: true, secret: true },
      { key: 'ELEVENLABS_VOICE_ID', required: true, secret: false },
    ],
    docs: 'https://elevenlabs.io/docs',
  },
];

const filled = (key: string) => !!process.env[key]?.trim();

export function isConfigured(def: ConnectionDef): boolean {
  return def.vars.every((v) => !v.required || filled(v.key));
}

/** Valor para mostrar: segredos aparecem só com o final. */
export function displayValue(key: string, secret: boolean): string | null {
  const v = process.env[key]?.trim();
  if (!v) return null;
  if (!secret) return v;
  return v.length <= 6 ? '••••••' : `••••••${v.slice(-4)}`;
}

export type ConnectionSummary = { slug: ConnectionSlug; label: string; tone: ConnectionTone; status: string };

/** Resumo para o menu: WhatsApp usa o estado que o webhook grava; as outras, só se as chaves existem. */
export function summarize(whatsappState: string | null): ConnectionSummary[] {
  return CONNECTIONS.map((def) => {
    if (!isConfigured(def)) return { slug: def.slug, label: def.label, tone: 'neutral', status: 'Não configurado' };
    if (def.slug !== 'whatsapp') return { slug: def.slug, label: def.label, tone: 'success', status: 'Chave configurada' };
    if (whatsappState === 'conectado') return { slug: def.slug, label: def.label, tone: 'success', status: 'Conectado' };
    if (whatsappState === 'conectando') return { slug: def.slug, label: def.label, tone: 'warning', status: 'Conectando' };
    return { slug: def.slug, label: def.label, tone: 'danger', status: 'Desconectado' };
  });
}
