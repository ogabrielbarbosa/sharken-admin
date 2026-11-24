import { toMobileE164 } from '@lps/domain';
import type { HistoryEvent, QuotedMessage, WhatsAppEvent, WhatsAppProvider } from '@lps/domain';
import { extractContent, KIND_SHORT, num, unwrap } from './evolution-content';

// Escrito para a Evolution API v2 (webhook com `event`, `instance` e `data`). Conferido na 2.3.7; referência em docs/evolution-api/.

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
  // O jid traz o código do país: sem o 55, é número de fora e não passa pela regra do celular brasileiro.
  const mobile = digits.startsWith('55') ? toMobileE164(digits) : null;
  if (mobile) return mobile;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

/** Reply: a Evolution põe o contextInfo no nível da mensagem ou dentro do tipo. stanzaId é o id da citada. */
function extractQuoted(data: Json): { externalId: string; text: string | null } | null {
  const message: Json = isObj(data.message) ? unwrap(data.message).message : {};
  const inner = Object.values(message).find((v): v is Json => isObj(v) && isObj(v.contextInfo));
  const ctx: Json | null = isObj(data.contextInfo) && str(data.contextInfo.stanzaId) ? data.contextInfo : isObj(inner?.contextInfo) ? inner.contextInfo : null;
  const externalId = str(ctx?.stanzaId);
  if (!ctx || !externalId) return null;
  if (!isObj(ctx.quotedMessage)) return { externalId, text: null };
  const content = extractContent(ctx.quotedMessage);
  return { externalId, text: content ? (content.text ?? content.meta.poll?.name ?? KIND_SHORT[content.type]) : null };
}

/** Número e LID de quem está do outro lado da conversa. */
function peer(key: Json, data: Json): { phoneE164: string | null; lid: string | null } {
  const jid = str(key.remoteJid);
  const isLid = !!jid?.endsWith('@lid');
  const alt = str(key.remoteJidAlt) ?? str(key.senderPn) ?? str(data.senderPn);
  return { phoneE164: isLid ? phoneFromJid(alt) : phoneFromJid(jid), lid: isLid ? jid!.split('@')[0]! : null };
}

const isIndividual = (jid: string | null) => !!jid && !jid.endsWith('@g.us') && !jid.endsWith('@broadcast') && !jid.endsWith('@newsletter');

/** protocolMessage: tipo 0 apaga para todos, tipo 14 edita. O número pode vir como texto. */
function normalizeProtocol(p: Json, at: Date): WhatsAppEvent[] {
  const target = str(p.key?.id);
  if (!target) return [];
  const t = typeof p.type === 'string' ? p.type.toUpperCase() : num(p.type);
  if (t === 0 || t === 'REVOKE') return [{ kind: 'revoke', targetExternalId: target, at }];
  if ((t === 14 || t === 'MESSAGE_EDIT') && isObj(p.editedMessage)) {
    const content = extractContent(p.editedMessage);
    return [{ kind: 'edit', targetExternalId: target, text: content?.text ?? null, at }];
  }
  return [];
}

function normalizeMessage(data: Json): WhatsAppEvent[] {
  const key = isObj(data.key) ? data.key : {};
  const jid = str(key.remoteJid);
  const externalId = str(key.id);
  if (!jid || !externalId || !isIndividual(jid)) return [];
  if (!isObj(data.message)) return [];
  const ts = num(data.messageTimestamp);
  const at = ts && ts > 0 ? new Date(ts * 1000) : new Date();
  const { phoneE164, lid } = peer(key, data);
  const fromMe = key.fromMe === true;
  const message = unwrap(data.message).message;

  if (isObj(message.reactionMessage)) {
    const target = str(message.reactionMessage.key?.id);
    return target ? [{ kind: 'reaction', targetExternalId: target, emoji: str(message.reactionMessage.text), phoneE164, lid, fromMe, at }] : [];
  }
  if (isObj(message.pollUpdateMessage)) {
    const target = str(message.pollUpdateMessage.pollCreationMessageKey?.id);
    // A Evolution decifra o voto e troca os hashes pelos nomes das opções.
    const selected: unknown[] = Array.isArray(message.pollUpdateMessage.vote?.selectedOptions) ? message.pollUpdateMessage.vote.selectedOptions : [];
    const options = selected.filter((o): o is string => typeof o === 'string');
    return target ? [{ kind: 'poll_vote', targetExternalId: target, options, phoneE164, lid, fromMe, at }] : [];
  }
  if (isObj(message.protocolMessage)) return normalizeProtocol(message.protocolMessage, at);

  const content = extractContent(data.message);
  if (!content) return [];
  const quoted = extractQuoted(data);
  return [
    {
      kind: 'message',
      externalId,
      phoneE164,
      lid,
      pushName: str(data.pushName),
      fromMe,
      text: content.text,
      media: content.media,
      type: content.type,
      meta: content.meta,
      at,
      ...(quoted ? { quoted } : {}),
      ...(data.status === 'EDITED' ? { edited: true } : {}),
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
  const mapped = state === 'open' ? 'conectado' : state === 'close' ? 'desconectado' : state === 'connecting' ? 'conectando' : null;
  if (!mapped) return [];
  const wuid = str(data.wuid);
  return [{
    kind: 'connection',
    state: mapped,
    phone: wuid ? `+${wuid.split('@')[0]!.replace(/\D/g, '')}` : null,
    profileName: str(data.profileName),
    statusReason: typeof data.statusReason === 'number' ? data.statusReason : null,
  }];
}

/** contacts.upsert / contacts.update: nome do perfil e foto. */
function normalizeProfile(data: Json): WhatsAppEvent[] {
  const jid = str(data.remoteJid) ?? str(data.id);
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return [];
  const isLid = jid.endsWith('@lid');
  const phoneE164 = isLid ? phoneFromJid(str(data.remoteJidAlt) ?? str(data.senderPn)) : phoneFromJid(jid);
  const avatarUrl = str(data.profilePicUrl) ?? str(data.profilePictureUrl);
  if (!phoneE164 && !isLid) return [];
  return [{ kind: 'profile', phoneE164, lid: isLid ? jid.split('@')[0]! : null, pushName: str(data.pushName), avatarUrl }];
}

const HISTORY_PAGE_SIZE = 200;
const HISTORY_MAX_PAGES = 100;

export function createEvolutionProvider(config: EvolutionConfig): WhatsAppProvider {
  const base = config.baseUrl.replace(/\/+$/, '');
  const doFetch = config.fetch ?? fetch;
  const headers = { apikey: config.apiKey, 'content-type': 'application/json' };
  // Sem instância dá para normalizar o webhook, mas não para falar com o WhatsApp.
  const inst = () => {
    if (!config.instance) throw new WhatsAppSendError('Nenhum WhatsApp conectado. Abra Atendimento › Conexões e adicione uma instância.');
    return encodeURIComponent(config.instance);
  };

  async function post(path: string, payload: Json): Promise<{ externalId: string }> {
    const res = await doFetch(`${base}${path}/${inst()}`, { method: 'POST', headers, body: JSON.stringify(payload) });
    const body: Json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const items: unknown[] = Array.isArray(body.response?.message) ? body.response.message : [];
      const invalid = items.some((m) => isObj(m) && m.exists === false);
      throw new WhatsAppSendError(invalid ? 'Esse número não tem WhatsApp.' : `A Evolution recusou o envio (${res.status}).`, invalid);
    }
    const externalId = str(body.key?.id);
    if (!externalId) throw new WhatsAppSendError('A Evolution não devolveu o id da mensagem.');
    return { externalId };
  }

  const MEDIATYPE = { imagem: 'image', video: 'video', documento: 'document' } as const;

  // Com `message` junto, a Evolution não precisa achar a original no banco dela para montar a citação.
  const quote = (number: string, q: QuotedMessage | null | undefined) =>
    q ? { quoted: { key: { id: q.externalId, remoteJid: `${number}@s.whatsapp.net`, fromMe: q.fromMe }, message: { conversation: q.text } } } : {};

  return {
    async sendText({ phoneE164, text, quoted }) {
      const number = phoneE164.replace(/\D/g, '');
      return post('/message/sendText', { number, text, ...quote(number, quoted) });
    },

    async sendMedia({ phoneE164, media, caption, quoted }) {
      const number = phoneE164.replace(/\D/g, '');
      if (media.kind === 'audio') return post('/message/sendWhatsAppAudio', { number, audio: media.base64, ...quote(number, quoted) });
      return post('/message/sendMedia', {
        number,
        mediatype: MEDIATYPE[media.kind],
        mimetype: media.mime,
        fileName: media.fileName,
        media: media.base64,
        ...(caption ? { caption } : {}),
        ...quote(number, quoted),
      });
    },

    normalize(raw) {
      if (!isObj(raw) || typeof raw.event !== 'string') return [];
      const event = raw.event.toLowerCase().replace(/_/g, '.');
      const items = Array.isArray(raw.data) ? raw.data : [raw.data];
      return items.filter(isObj).flatMap((data) => {
        if (event === 'messages.upsert') return normalizeMessage(data);
        if (event === 'messages.update') return normalizeUpdate(data);
        // Edição e "apagar para todos" (protocolMessage) e mensagem apagada (messages.delete).
        if (event === 'messages.edited') return normalizeProtocol(data, new Date());
        if (event === 'messages.delete') return str(data.id) ?? str(data.key?.id) ? [{ kind: 'revoke', targetExternalId: (str(data.id) ?? str(data.key?.id))!, at: new Date() }] : [];
        if (event === 'connection.update') return normalizeConnection(data);
        if (event === 'contacts.upsert' || event === 'contacts.update') return normalizeProfile(data);
        return [];
      });
    },

    async downloadMedia(externalId) {
      const res = await doFetch(`${base}/chat/getBase64FromMediaMessage/${inst()}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: { key: { id: externalId } } }),
      });
      if (!res.ok) throw new Error(`A Evolution não entregou a mídia (${res.status}).`);
      const body: Json = await res.json().catch(() => ({}));
      const base64 = str(body.base64);
      return base64 ? { base64, mime: str(body.mimetype) } : null;
    },

    async recentMessages(since) {
      // O filtro de data do findMessages não funciona na 2.3.7: pagina da mais nova para a mais antiga e para no corte.
      const cutoff = Math.floor(since.getTime() / 1000);
      const out: HistoryEvent[] = [];
      for (let page = 1; page <= HISTORY_MAX_PAGES; page++) {
        const res = await doFetch(`${base}/chat/findMessages/${inst()}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ where: {}, offset: HISTORY_PAGE_SIZE, page }),
        });
        if (!res.ok) throw new Error(`A Evolution não entregou o histórico (${res.status}).`);
        const body: Json = await res.json().catch(() => ({}));
        const records: unknown[] = Array.isArray(body.messages?.records) ? body.messages.records : [];
        let reachedCutoff = records.length < HISTORY_PAGE_SIZE;
        for (const record of records) {
          if (!isObj(record)) continue;
          if (Number(record.messageTimestamp) < cutoff) { reachedCutoff = true; continue; }
          for (const e of normalizeMessage(record)) if (e.kind === 'message' || e.kind === 'reaction' || e.kind === 'poll_vote') out.push(e);
        }
        if (reachedCutoff) break;
      }
      return out.sort((a, b) => a.at.getTime() - b.at.getTime());
    },

    async contactProfiles() {
      const res = await doFetch(`${base}/chat/findContacts/${inst()}`, { method: 'POST', headers, body: JSON.stringify({}) });
      if (!res.ok) throw new Error(`A Evolution não entregou os contatos (${res.status}).`);
      const body: unknown = await res.json().catch(() => []);
      const records = Array.isArray(body) ? body.filter(isObj) : [];
      return records.flatMap((r) => normalizeProfile(r)).filter((e): e is Extract<WhatsAppEvent, { kind: 'profile' }> => e.kind === 'profile');
    },

    async profilePictureUrl(phoneE164) {
      const res = await doFetch(`${base}/chat/fetchProfilePictureUrl/${inst()}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number: phoneE164.replace(/\D/g, '') }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const body: Json = await res.json().catch(() => ({}));
      return str(body.profilePictureUrl);
    },

    async connectionQr() {
      const res = await doFetch(`${base}/instance/connect/${inst()}`, { headers: { apikey: config.apiKey } });
      if (!res.ok) throw new Error(`Não foi possível pedir o QR à Evolution (${res.status}).`);
      const body: Json = await res.json().catch(() => ({}));
      return str(body.base64);
    },
  };
}
