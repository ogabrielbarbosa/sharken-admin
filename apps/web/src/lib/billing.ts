import { getEnv, webhookBaseUrl } from '@lps/config';
import { createAdminClient, getWorkspaceBilling, requireWorkspace, type Db } from '@lps/db';
import { abacatePay } from '@lps/integrations';

export const BILLING_NOT_CONFIGURED = 'Este workspace ainda não tem a AbacatePay. Cadastre a chave em Configurações › Pagamentos.';

/** Cliente da AbacatePay com a chave do workspace do `db`. Cada workspace cobra na própria conta. */
export async function workspaceAbacate(db: Db) {
  const billing = await getWorkspaceBilling(createAdminClient(), requireWorkspace(db));
  if (!billing) throw new Error(BILLING_NOT_CONFIGURED);
  return abacatePay(billing.api_key);
}

/** URL do webhook do workspace. Sempre a pública: a AbacatePay só aceita HTTPS fora da rede local. */
export const abacateWebhookUrl = (workspaceId: string) => `${webhookBaseUrl(getEnv()).replace(/\/+$/, '')}/api/webhooks/abacatepay/${workspaceId}`;
