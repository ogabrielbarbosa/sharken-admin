// Túnel do WhatsApp no local: a Evolution da VPS não alcança localhost, então o pnpm local abre um
// túnel do Cloudflare (sem conta) e aponta o webhook da instância em uso para ele.
//
// O túnel rápido do Cloudflare cai de vez em quando e a URL muda a cada abertura. Por isso um vigia
// confere a cada 30 s se o túnel responde e se o webhook da instância em uso aponta para ele: se o
// túnel caiu, abre outro e reaponta; se a instância mudou (Nova instância na tela), aponta a nova.
// O painel não mexe no webhook nesse modo (whatsappWebhookUrl devolve null para endereço local).
import { spawn } from 'node:child_process';
import { ok, quiet, warn } from './lib.mjs';

const EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_EDITED', 'MESSAGES_DELETE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE'];
const CHECK_MS = 30_000;
const MAX_FAILED_CHECKS = 3;

const isLocal = (url) => /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)\b/.test(url);
const time = () => new Date().toLocaleTimeString('pt-BR');
const log = (msg) => console.log(`[whatsapp ${time()}] ${msg}`);

/** Abre o túnel e devolve { url, child }, ou null. O túnel fecha junto com o pnpm local. */
function openTunnel(port) {
  return new Promise((resolve) => {
    const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => { if (child.exitCode === null) child.kill(); };
    process.on('exit', stop);
    let done = false;
    const finish = (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { stop(); finish(null); }, 30_000);
    // Os listeners ficam ligados para sempre: o cloudflared escreve log o tempo todo e trava se o pipe encher.
    const onData = (buf) => {
      const url = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (url) finish({ url, child });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => finish(null));
    child.on('exit', () => { process.off('exit', stop); finish(null); });
  });
}

async function openTunnelWithRetry(port, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const t = await openTunnel(port);
    if (t) return t;
    if (i < attempts) await new Promise((r) => setTimeout(r, 3000 * i));
  }
  return null;
}

/** Instância em uso, salva pela tela Conexões › WhatsApp. */
async function activeInstance(env) {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/whatsapp_connection?select=instance&id=eq.1`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    const rows = res.ok ? await res.json() : [];
    return rows[0]?.instance || env.EVOLUTION_INSTANCE || null;
  } catch {
    return null;
  }
}

const evo = (env, path, init = {}) => fetch(`${env.EVOLUTION_URL.replace(/\/+$/, '')}${path}`, {
  ...init,
  headers: { apikey: env.EVOLUTION_API_KEY, 'content-type': 'application/json' },
  signal: AbortSignal.timeout(15_000),
}).catch(() => null);

/** Aponta o webhook da instância para `base` só se ele estiver diferente. Devolve 'ok' | 'mudou' | 'sem-instancia' | 'erro'. */
async function pointWebhook(env, instance, base) {
  const url = `${base.replace(/\/+$/, '')}/api/webhooks/whatsapp?token=${env.WHATSAPP_WEBHOOK_SECRET}`;
  const name = encodeURIComponent(instance);
  const found = await evo(env, `/webhook/find/${name}`);
  if (found?.status === 404) return 'sem-instancia';
  const current = found?.ok ? await found.json().catch(() => null) : null;
  if (current?.url === url && current.enabled && EVENTS.every((e) => current.events?.includes(e))) return 'ok';
  const res = await evo(env, `/webhook/set/${name}`, {
    method: 'POST',
    body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: true, events: EVENTS } }),
  });
  if (res?.ok) return 'mudou';
  return res?.status === 404 ? 'sem-instancia' : 'erro';
}

/** O túnel chega ao painel? A rota do webhook responde 401 sem o token. */
async function tunnelAlive(base) {
  try {
    const res = await fetch(`${base}/api/webhooks/whatsapp`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(10_000) });
    return res.status === 401;
  } catch {
    return false;
  }
}

/** Confere túnel e webhook a cada 30 s e conserta o que precisar. */
function watch(env, port, initial) {
  let tunnel = initial;
  let failed = 0;
  let busy = false;
  let lastInstance = null;

  const reopen = async (why) => {
    log(`túnel caiu (${why}); abrindo outro...`);
    if (tunnel.child.exitCode === null) tunnel.child.kill();
    const next = await openTunnelWithRetry(port);
    if (!next) { log('não deu para abrir o túnel; tento de novo em 30 s. Enquanto isso, mensagens recebidas não chegam.'); return false; }
    tunnel = next;
    failed = 0;
    log(`túnel novo: ${tunnel.url}`);
    return true;
  };

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (tunnel.child.exitCode !== null) {
        if (!(await reopen('processo encerrou'))) return;
      } else if (!(await tunnelAlive(tunnel.url))) {
        failed++;
        if (failed >= MAX_FAILED_CHECKS && !(await reopen('não responde'))) return;
        if (failed > 0 && failed < MAX_FAILED_CHECKS) return;
      } else {
        failed = 0;
      }
      const instance = await activeInstance(env);
      if (!instance) return;
      const r = await pointWebhook(env, instance, tunnel.url);
      if (r === 'mudou') log(`webhook da instância ${instance} apontado para ${tunnel.url}`);
      else if (r === 'erro') log(`não deu para conferir o webhook da instância ${instance}; tento de novo em 30 s`);
      else if (r === 'ok' && instance !== lastInstance && lastInstance !== null) log(`instância em uso agora: ${instance}`);
      lastInstance = instance;
    } finally {
      busy = false;
    }
  };

  setInterval(() => { void tick(); }, CHECK_MS).unref();
  return tick;
}

/**
 * Abre o túnel, aponta o webhook e liga o vigia. Devolve variáveis extras para o painel ({} sempre:
 * a URL do túnel muda, então o painel não a recebe e deixa o webhook com o vigia).
 * Com WHATSAPP_WEBHOOK_BASE_URL no .env.local (URL fixa), não abre túnel: o painel usa ela.
 */
export async function prepareWhatsAppTunnel(env, port) {
  if (!env.EVOLUTION_URL || !env.EVOLUTION_API_KEY || !env.WHATSAPP_WEBHOOK_SECRET) return {};
  if (isLocal(env.EVOLUTION_URL)) return {};
  if (env.WHATSAPP_WEBHOOK_BASE_URL) {
    ok(`webhook do WhatsApp por ${env.WHATSAPP_WEBHOOK_BASE_URL} (URL fixa do .env.local)`);
    return {};
  }
  if (quiet('which', ['cloudflared']) === null) {
    warn('Instale o cloudflared (brew install cloudflared) para receber mensagens do WhatsApp no local.');
    return {};
  }
  const tunnel = await openTunnelWithRetry(port);
  if (!tunnel) {
    warn('O túnel do Cloudflare não abriu. O envio funciona, mas as mensagens recebidas não chegam no local.');
    return {};
  }
  ok(`webhook do WhatsApp por ${tunnel.url} (conferido a cada 30 s)`);

  const instance = await activeInstance(env);
  if (!instance) ok('nenhuma instância ainda: crie em Atendimento › Conexões › Nova instância');
  else {
    const r = await pointWebhook(env, instance, tunnel.url);
    if (r === 'ok' || r === 'mudou') ok(`instância ${instance} apontada para este Mac`);
    else if (r === 'sem-instancia') ok(`a instância ${instance} ainda não existe na Evolution: em Atendimento › Conexões, clique em Conectar celular (ou Nova instância)`);
    else warn(`Não deu para apontar o webhook da instância ${instance} agora; o vigia tenta de novo em 30 s.`);
  }
  watch(env, port, tunnel);
  return {};
}
