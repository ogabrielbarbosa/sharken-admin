import './env';
import { getEnv, requireOptional, webhookBaseUrl } from '@lps/config';

// Registra na instância da Evolution o webhook que alimenta o CRM.
const env = getEnv();
const base = requireOptional('EVOLUTION_URL').replace(/\/+$/, '');
const instance = requireOptional('EVOLUTION_INSTANCE');
const secret = requireOptional('WHATSAPP_WEBHOOK_SECRET');
const url = `${webhookBaseUrl(env)}/api/webhooks/whatsapp?token=${secret}`;
const events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'];
const headers = { apikey: requireOptional('EVOLUTION_API_KEY'), 'content-type': 'application/json' };
const endpoint = `${base}/webhook/set/${encodeURIComponent(instance)}`;

async function post(body: unknown) {
  return fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
}

const flat = { enabled: true, url, webhookByEvents: false, webhookBase64: true, events };
let res = await post(flat);
// Versões mais novas da Evolution v2 esperam o objeto dentro de `webhook`.
if (!res.ok) res = await post({ webhook: { enabled: true, url, byEvents: false, base64: true, events } });
if (!res.ok) {
  console.error(`A Evolution recusou o webhook (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(`Webhook registrado na instância ${instance}: ${webhookBaseUrl(env)}/api/webhooks/whatsapp (${events.join(', ')}).`);
