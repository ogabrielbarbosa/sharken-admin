import { toMobileE164 } from '@lps/domain';
import type { InboundMedia, WhatsAppEvent, WhatsAppProvider } from '@lps/domain';

// Escrito para a Evolution API v2 (webhook com `event`, `instance` e `data`). A versão do servidor não foi conferida.

export class WhatsAppSendError extends Error {
  constructor(message: string, public invalidNumber = false) {
    super(message);
    this.name = 'WhatsAppSendError';
  }
}

type Json = Record<string, any>;
type FetchFn = typeof fetch;
export type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string; fetch?: FetchFn };

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function phoneFromJid(jid: string | null): string | null {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  const digits = jid.split('@')[0]!.replace(/\D/g, '');
  const mobile = toMobileE164(digits);
  if (mobile) return `+${mobile}`;
  return /^\d{10,15}$/.test(digits) ? `+${digits}` : null;
}

const MEDIA_KINDS: Record<string, InboundMedia['kind']> = {
  imageMessage: 'imagem',
  audioMessage: 'audio',
  videoMessage: 'video',
  ptvMessage: 'video',
  documentMessage: 'documento',
  documentWithCaptionMessage: 'documento',
  stickerMessage: 'outro',
};

function extractContent(message: Json): { text: string | null; media: InboundMedia | null } {
  let text = str(message.conversation) ?? str(message.extendedTextMessage?.text);
  for (const [type, kind] of Object.entries(MEDIA_KINDS)) {
    let body = message[type];
    if (!isObj(body)) continue;
    if (type === 'documentWithCaptionMessage' && isObj(body.message?.documentMessage)) body = body.message.documentMessage;
    text = text ?? str(body.caption);
    return { text, media: { kind, mime: str(body.mimetype), url: str(body.url), base64: str(message.base64) ?? str(body.base64) } };
  }
  return { text, media: null };
}

function normalizeMessage(data: Json): WhatsAppEvent[] {
  const key = isObj(data.key) ? data.key : {};
  const jid = str(key.remoteJid);
  const externalId = str(key.id);
  if (!jid || !externalId) return [];
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return [];
  if (!isObj(data.message)) return [];
  const { text, media } = extractContent(data.message);
  if (!text && !media) return [];

  const isLid = jid.endsWith('@lid');
  const alt = str(key.remoteJidAlt) ?? str(key.senderPn) ?? str(data.senderPn);
  const phoneE164 = isLid ? phoneFromJid(alt) : phoneFromJid(jid);
  const ts = Number(data.messageTimestamp);
  return [
    {
      kind: 'message',
      externalId,
      phoneE164,
      lid: isLid ? jid.split('@')[0]! : null,
      pushName: str(data.pushName),
      fromMe: key.fromMe === true,
      text,
      media,
      at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
    },
  ];
}

const STATUS: Record<string, 'enviada' | 'entregue' | 'lida' | 'erro'> = {
  SERVER_ACK: 'enviada',
  SENT: 'enviada',
  DELIVERY_ACK: 'entregue',
  DELIVERED: 'entregue',
  READ: 'lida',
  PLAYED: 'lida',
  ERROR: 'erro',
  FAILED: 'erro',
};
const NUMERIC_STATUS: Record<number, 'enviada' | 'entregue' | 'lida' | 'erro'> = { 0: 'erro', 1: 'enviada', 2: 'enviada', 3: 'entregue', 4: 'lida', 5: 'lida' };

function normalizeUpdate(data: Json): WhatsAppEvent[] {
  const externalId = str(data.keyId) ?? str(data.key?.id) ?? str(data.messageId);
  const raw = data.status ?? data.update?.status;
  const status = typeof raw === 'number' ? NUMERIC_STATUS[raw] : typeof raw === 'string' ? STATUS[raw.toUpperCase()] : undefined;
  return externalId && status ? [{ kind: 'status', externalId, status }] : [];
}

function normalizeConnection(data: Json): WhatsAppEvent[] {
  const state = typeof data.state === 'string' ? data.state.toLowerCase() : '';
  if (state === 'open') return [{ kind: 'connection', state: 'conectado' }];
  if (state === 'close') return [{ kind: 'connection', state: 'desconectado' }];
  if (state === 'connecting') return [{ kind: 'connection', state: 'conectando' }];
  return [];
}

export function createEvolutionProvider(config: EvolutionConfig): WhatsAppProvider {
  const base = config.baseUrl.replace(/\/+$/, '');
  const doFetch = config.fetch ?? fetch;
  const headers = { apikey: config.apiKey, 'content-type': 'application/json' };

  return {
    async sendText({ phoneE164, text }) {
      const res = await doFetch(`${base}/message/sendText/${encodeURIComponent(config.instance)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number: phoneE164.replace(/\D/g, ''), text }),
      });
      const body: Json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const items: unknown[] = Array.isArray(body.response?.message) ? body.response.message : [];
        const invalid = items.some((m) => isObj(m) && m.exists === false);
        throw new WhatsAppSendError(invalid ? 'Esse número não tem WhatsApp.' : `A Evolution recusou o envio (${res.status}).`, invalid);
      }
      const externalId = str(body.key?.id);
      if (!externalId) throw new WhatsAppSendError('A Evolution não devolveu o id da mensagem.');
      return { externalId };
    },

    normalize(raw) {
      if (!isObj(raw) || typeof raw.event !== 'string') return [];
      const event = raw.event.toLowerCase().replace(/_/g, '.');
      const items = Array.isArray(raw.data) ? raw.data : [raw.data];
      return items.filter(isObj).flatMap((data) => {
        if (event === 'messages.upsert') return normalizeMessage(data);
        if (event === 'messages.update') return normalizeUpdate(data);
        if (event === 'connection.update') return normalizeConnection(data);
        return [];
      });
    },

    async connectionQr() {
      const res = await doFetch(`${base}/instance/connect/${encodeURIComponent(config.instance)}`, { headers: { apikey: config.apiKey } });
      if (!res.ok) throw new Error(`Não foi possível pedir o QR à Evolution (${res.status}).`);
      const body: Json = await res.json().catch(() => ({}));
      return str(body.base64);
    },
  };
}
