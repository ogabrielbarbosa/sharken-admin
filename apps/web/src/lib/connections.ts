// Conexão do WhatsApp (Evolution API). As chaves ficam no .env; aqui só se lê se estão preenchidas.

export type ConnectionTone = 'success' | 'warning' | 'danger' | 'neutral';

export const WHATSAPP = {
  label: 'WhatsApp',
  provider: 'Evolution API v2',
  description: 'Conversas do atendimento: recebe e envia mensagens pelo número conectado.',
  vars: [
    { key: 'EVOLUTION_URL', required: true },
    { key: 'EVOLUTION_API_KEY', required: true },
    { key: 'WHATSAPP_WEBHOOK_SECRET', required: true },
    { key: 'WHATSAPP_WEBHOOK_BASE_URL', required: false },
  ],
} as const;

export function whatsappConfigured(): boolean {
  return WHATSAPP.vars.every((v) => !v.required || !!process.env[v.key]?.trim());
}

export type ConnectionSummary = { tone: ConnectionTone; status: string };

/** Resumo para o menu: usa o estado que o webhook grava. */
export function summarizeWhatsApp(state: string | null): ConnectionSummary {
  if (!whatsappConfigured()) return { tone: 'neutral', status: 'Não configurado' };
  if (state === 'conectado') return { tone: 'success', status: 'Conectado' };
  if (state === 'conectando') return { tone: 'warning', status: 'Conectando' };
  return { tone: 'danger', status: 'Desconectado' };
}
