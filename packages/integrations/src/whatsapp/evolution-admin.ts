import { requireOptional } from '@lps/config';

// Administração da instância na Evolution API v2 (conferido na 2.3.7): criar, conectar, desconectar e webhook.
// Referência em docs/evolution-api/.

type Json = Record<string, any>;
export type EvolutionAdminConfig = { baseUrl: string; apiKey: string; instance: string; fetch?: typeof fetch };
export type EvolutionState = 'conectado' | 'desconectado' | 'conectando';

export const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE'] as const;

export type EvolutionInstance = {
  name: string;
  state: EvolutionState;
  phone: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  disconnectionAt: string | null;
  createdAt: string | null;
};

export type EvolutionOverview = {
  reachable: boolean;
  version: string | null;
  whatsappWebVersion: string | null;
  error: string | null;
  instance: EvolutionInstance | null;
  webhook: { url: string; enabled: boolean; events: string[] } | null;
};

const TIMEOUT_MS = 6000;

export function toState(raw: unknown): EvolutionState {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  return s === 'open' ? 'conectado' : s === 'connecting' ? 'conectando' : 'desconectado';
}

export function createEvolutionAdmin(config: EvolutionAdminConfig) {
  const base = config.baseUrl.replace(/\/+$/, '');
  const doFetch = config.fetch ?? fetch;
  const name = encodeURIComponent(config.instance);

  async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { apikey: config.apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  function message(data: any, status: number): string {
    const m = data?.response?.message ?? data?.message ?? data?.error;
    const text = Array.isArray(m) ? m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ') : typeof m === 'string' ? m : '';
    return `Evolution respondeu ${status}${text ? `: ${text}` : ''}`;
  }

  async function fetchInstance(): Promise<EvolutionInstance | null> {
    const r = await call('GET', `/instance/fetchInstances?instanceName=${name}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(message(r.data, r.status));
    const row: Json | undefined = Array.isArray(r.data) ? r.data.find((x: Json) => x?.name === config.instance) : undefined;
    if (!row) return null;
    return {
      name: row.name,
      state: toState(row.connectionStatus),
      phone: typeof row.ownerJid === 'string' ? `+${row.ownerJid.split('@')[0]}` : typeof row.number === 'string' ? row.number : null,
      profileName: row.profileName ?? null,
      profilePicUrl: row.profilePicUrl ?? null,
      disconnectionAt: row.disconnectionAt ?? null,
      createdAt: row.createdAt ?? null,
    };
  }

  return {
    instanceName: config.instance,

    /** Tudo o que a tela de conexão precisa, sem lançar erro: servidor fora do ar vira `reachable: false`. */
    async overview(): Promise<EvolutionOverview> {
      try {
        const root = await call('GET', '/');
        const out: EvolutionOverview = { reachable: true, version: root.data?.version ?? null, whatsappWebVersion: root.data?.whatsappWebVersion ?? null, error: null, instance: null, webhook: null };
        out.instance = await fetchInstance();
        if (out.instance) {
          const w = await call('GET', `/webhook/find/${name}`);
          if (w.ok && w.data?.url) out.webhook = { url: w.data.url, enabled: !!w.data.enabled, events: w.data.events ?? [] };
        }
        return out;
      } catch (e) {
        const err = e as Error;
        const msg = err.name === 'TimeoutError' ? 'A Evolution não respondeu a tempo.' : /fetch failed|ECONNREFUSED/i.test(err.message) ? `Não foi possível falar com ${base}.` : err.message;
        return { reachable: false, version: null, whatsappWebVersion: null, error: msg, instance: null, webhook: null };
      }
    },

    fetchInstance,

    async connectionState(): Promise<EvolutionState> {
      const r = await call('GET', `/instance/connectionState/${name}`);
      if (!r.ok) throw new Error(message(r.data, r.status));
      return toState(r.data?.instance?.state);
    },

    async createInstance(): Promise<void> {
      const r = await call('POST', '/instance/create', { instanceName: config.instance, integration: 'WHATSAPP-BAILEYS', qrcode: false });
      if (!r.ok) throw new Error(message(r.data, r.status));
    },

    /** QR (data URL) e código de pareamento. Com `phone`, a Evolution gera o código para digitar no celular. */
    async connect(phone?: string): Promise<{ qr: string | null; pairingCode: string | null }> {
      const query = phone ? `?number=${encodeURIComponent(phone.replace(/\D/g, ''))}` : '';
      const r = await call('GET', `/instance/connect/${name}${query}`);
      if (!r.ok) throw new Error(message(r.data, r.status));
      return { qr: r.data?.base64 ?? null, pairingCode: r.data?.pairingCode ?? null };
    },

    async logout(): Promise<void> {
      const r = await call('DELETE', `/instance/logout/${name}`);
      if (!r.ok && r.status !== 400) throw new Error(message(r.data, r.status));
    },

    async restart(): Promise<void> {
      const r = await call('POST', `/instance/restart/${name}`);
      if (!r.ok) throw new Error(message(r.data, r.status));
    },

    async setWebhook(url: string): Promise<void> {
      const r = await call('POST', `/webhook/set/${name}`, { webhook: { enabled: true, url, byEvents: false, base64: true, events: [...WEBHOOK_EVENTS] } });
      if (!r.ok) throw new Error(message(r.data, r.status));
    },

    async profilePictureUrl(phoneE164: string): Promise<string | null> {
      const r = await call('POST', `/chat/fetchProfilePictureUrl/${name}`, { number: phoneE164.replace(/\D/g, '') });
      if (!r.ok) return null;
      return typeof r.data?.profilePictureUrl === 'string' && r.data.profilePictureUrl ? r.data.profilePictureUrl : null;
    },
  };
}

export type EvolutionAdmin = ReturnType<typeof createEvolutionAdmin>;

/** Lê a configuração na hora. Sem as variáveis, devolve null para a tela mostrar "não configurado". */
export function getEvolutionAdmin(source: Record<string, string | undefined> = process.env): EvolutionAdmin | null {
  try {
    return createEvolutionAdmin({
      baseUrl: requireOptional('EVOLUTION_URL', source),
      apiKey: requireOptional('EVOLUTION_API_KEY', source),
      instance: requireOptional('EVOLUTION_INSTANCE', source),
    });
  } catch {
    return null;
  }
}
