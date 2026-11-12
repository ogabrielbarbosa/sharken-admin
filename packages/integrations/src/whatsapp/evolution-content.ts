import type { InboundMedia, MessageButton, MessageKind, MessageMeta, SharedContact } from '@lps/domain';

// Conteúdo de uma mensagem do WhatsApp (o objeto `message` do Baileys, como a Evolution 2.3.7 manda no
// webhook e guarda no banco). Cada tipo vira um `kind` do CRM, um texto e os detalhes em `meta`.
// Tipos conferidos nas mensagens reais da instância (Message.messageType) e no proto do WhatsApp.

type Json = Record<string, any>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Números do proto chegam como number, string ou Long ({ low, high }). */
export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  if (isObj(v) && typeof v.low === 'number') return (v.high ?? 0) * 2 ** 32 + (v.low >>> 0);
  return null;
}

/** Bytes chegam como base64, { type: 'Buffer', data } ou { '0': n, '1': n... } depois da desserialização. */
function bytes(v: unknown): number[] | null {
  if (typeof v === 'string' && v) {
    try {
      return [...Buffer.from(v, 'base64')];
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return v.filter((n): n is number => typeof n === 'number');
  if (isObj(v) && Array.isArray(v.data)) return v.data.filter((n: unknown): n is number => typeof n === 'number');
  if (isObj(v)) {
    const vals = Object.keys(v).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]);
    return vals.length && vals.every((n) => typeof n === 'number') ? vals : null;
  }
  return null;
}

/** Envelopes que só embrulham outra mensagem. viewOnce marca visualização única. */
const WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
  'associatedChildMessage',
  'deviceSentMessage',
  'lottieStickerMessage',
  'groupMentionedMessage',
  'botInvokeMessage',
  'futureProofMessage',
];

/** Não são conteúdo para o chat: chaves de criptografia, controle, cabeçalho de álbum (as fotos vêm depois, uma a uma). */
const IGNORED = new Set([
  'messageContextInfo',
  'senderKeyDistributionMessage',
  'albumMessage',
  'placeholderMessage',
  'secretEncryptedMessage',
  'encReactionMessage',
  'keepInChatMessage',
  'pinInChatMessage',
  'encEventResponseMessage',
  'eventResponseMessage',
  'pollUpdateMessage',
  'reactionMessage',
  'protocolMessage',
  'messageHistoryBundle',
  'requestPhoneNumberMessage',
]);

export function unwrap(message: Json): { message: Json; viewOnce: boolean } {
  let current = message;
  let viewOnce = false;
  for (let depth = 0; depth < 6; depth++) {
    const wrapper = WRAPPERS.find((w) => isObj(current[w]?.message));
    if (!wrapper) break;
    if (wrapper.startsWith('viewOnce')) viewOnce = true;
    current = current[wrapper].message;
  }
  return { message: current, viewOnce };
}

/** O tipo da mensagem: a primeira chave que é conteúdo (como o getContentType do Baileys). */
export function contentType(message: Json): string | null {
  return Object.keys(message).find((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage' && message[k] != null) ?? null;
}

/** Forma de onda do WhatsApp: 64 bytes de 0 a 100. */
function waveform(v: unknown): number[] | undefined {
  const b = bytes(v);
  if (!b || b.length < 8) return undefined;
  return b.map((n) => Math.max(0, Math.min(100, n)));
}

/** vCard: nome (FN) e telefones (o waid é o número no WhatsApp, quando vem). */
export function parseVcard(vcard: string | null, displayName: string | null): SharedContact {
  const lines = (vcard ?? '').replace(/\r\n[ \t]/g, '').split(/\r?\n/);
  const fn = lines.find((l) => /^FN[;:]/i.test(l))?.replace(/^FN[^:]*:/i, '').trim();
  const phones = lines
    .filter((l) => /^(item\d+\.)?TEL/i.test(l))
    .map((l) => {
      const waid = l.match(/waid=(\d+)/i)?.[1];
      const value = l.replace(/^[^:]*:/, '').trim();
      return waid ? `+${waid}` : value;
    })
    .filter(Boolean);
  return { name: displayName ?? fn ?? phones[0] ?? 'Contato', phones: [...new Set(phones)] };
}

function mediaOf(kind: InboundMedia['kind'], body: Json, root: Json, fallbackMime: string | null = null): InboundMedia {
  return { kind, mime: str(body.mimetype) ?? fallbackMime, url: str(body.url), base64: str(root.base64) ?? str(body.base64) };
}

function dims(body: Json): Pick<MessageMeta, 'width' | 'height'> {
  const width = num(body.width);
  const height = num(body.height);
  return width && height ? { width, height } : {};
}

function forwarded(body: Json): boolean {
  return body?.contextInfo?.isForwarded === true || (num(body?.contextInfo?.forwardingScore) ?? 0) > 0;
}

/** Botões de modelo (hydratedButtons), de botões antigos e de mensagens interativas (nativeFlow). */
function buttonsOf(body: Json): MessageButton[] {
  const out: MessageButton[] = [];
  for (const b of Array.isArray(body.hydratedButtons) ? body.hydratedButtons : []) {
    if (!isObj(b)) continue;
    const quick = str(b.quickReplyButton?.displayText);
    const url = str(b.urlButton?.displayText);
    const call = str(b.callButton?.displayText);
    if (quick) out.push({ label: quick });
    else if (url) out.push({ label: url, url: str(b.urlButton?.url) });
    else if (call) out.push({ label: call });
  }
  for (const b of Array.isArray(body.buttons) ? body.buttons : []) {
    if (!isObj(b)) continue;
    const label = str(b.buttonText?.displayText);
    if (label) out.push({ label });
    if (str(b.buttonParamsJson)) {
      try {
        const p = JSON.parse(b.buttonParamsJson);
        const text = str(p.display_text) ?? str(p.title);
        if (text) out.push({ label: text, url: str(p.url) ?? str(p.merchant_url) });
      } catch {
        // botão sem parâmetros legíveis: fica de fora
      }
    }
  }
  return out;
}

/** Cabeçalho com mídia (modelo, interativa, botões): imagem, vídeo ou documento. */
function headerMedia(header: Json | null, root: Json): { media: InboundMedia | null; meta: MessageMeta } {
  if (!header) return { media: null, meta: {} };
  if (isObj(header.imageMessage)) return { media: mediaOf('imagem', header.imageMessage, root), meta: dims(header.imageMessage) };
  if (isObj(header.videoMessage)) return { media: mediaOf('video', header.videoMessage, root), meta: { ...dims(header.videoMessage), ...(num(header.videoMessage.seconds) ? { seconds: num(header.videoMessage.seconds)! } : {}) } };
  if (isObj(header.documentMessage)) return { media: mediaOf('documento', header.documentMessage, root), meta: { fileName: str(header.documentMessage.fileName) ?? undefined } };
  return { media: null, meta: {} };
}

const joinText = (...parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p && p.trim() !== '').join('\n\n') || null;

export type Content = { type: MessageKind; text: string | null; media: InboundMedia | null; meta: MessageMeta };

/**
 * Lê o conteúdo de `message`. Devolve null para o que não aparece no chat (controle, cabeçalho de álbum,
 * reação, voto, edição: esses viram eventos próprios). Tipo desconhecido vira `outro` com meta.unsupported,
 * para o painel avisar em vez de sumir com a mensagem.
 */
export function extractContent(raw: Json): Content | null {
  const { message, viewOnce } = unwrap(raw);
  const type = contentType(message);
  if (!type || IGNORED.has(type)) return null;
  const body: Json = isObj(message[type]) ? message[type] : {};
  const base: MessageMeta = {
    ...(viewOnce || body.viewOnce === true ? { viewOnce: true } : {}),
    ...(forwarded(body) ? { forwarded: true } : {}),
  };
  const out = (t: MessageKind, text: string | null, media: InboundMedia | null, meta: MessageMeta = {}): Content => ({ type: t, text, media, meta: { ...base, ...meta } });

  switch (type) {
    case 'conversation':
      return str(message.conversation) ? out('texto', message.conversation, null) : null;
    case 'extendedTextMessage':
      return str(body.text) ? out('texto', body.text, null) : null;

    case 'imageMessage':
      return out('imagem', str(body.caption), mediaOf('imagem', body, raw, 'image/jpeg'), dims(body));
    case 'videoMessage': {
      const seconds = num(body.seconds);
      return out('video', str(body.caption), mediaOf('video', body, raw, 'video/mp4'), { ...dims(body), ...(seconds ? { seconds } : {}), ...(body.gifPlayback === true ? { gif: true } : {}) });
    }
    case 'ptvMessage': {
      const seconds = num(body.seconds);
      return out('video', str(body.caption), mediaOf('video', body, raw, 'video/mp4'), { ...dims(body), ...(seconds ? { seconds } : {}), round: true });
    }
    case 'audioMessage': {
      const seconds = num(body.seconds);
      const wave = waveform(body.waveform);
      return out('audio', null, mediaOf('audio', body, raw, 'audio/ogg; codecs=opus'), { ...(seconds ? { seconds } : {}), ...(body.ptt === true ? { ptt: true } : {}), ...(wave ? { waveform: wave } : {}) });
    }
    case 'documentMessage': {
      const size = num(body.fileLength);
      const pages = num(body.pageCount);
      const fileName = str(body.fileName) ?? str(body.title);
      return out('documento', str(body.caption), mediaOf('documento', body, raw, 'application/octet-stream'), {
        ...(fileName ? { fileName } : {}),
        ...(size ? { size } : {}),
        ...(pages ? { pages } : {}),
      });
    }
    case 'stickerMessage':
      return out('sticker', null, mediaOf('sticker', body, raw, body.isLottie ? 'application/was' : 'image/webp'), {
        ...dims(body),
        ...(body.isAnimated === true ? { animated: true } : {}),
        ...(body.isLottie === true ? { lottie: true } : {}),
      });

    case 'locationMessage':
    case 'liveLocationMessage': {
      const lat = num(body.degreesLatitude);
      const lng = num(body.degreesLongitude);
      if (lat === null || lng === null) return out('outro', null, null, { unsupported: type });
      const live = type === 'liveLocationMessage';
      return out('localizacao', str(body.caption) ?? str(body.comment), null, {
        location: { lat, lng, name: str(body.name), address: str(body.address), url: str(body.url), ...(live ? { live } : {}) },
      });
    }

    case 'contactMessage':
      return out('contato', null, null, { contacts: [parseVcard(str(body.vcard), str(body.displayName))] });
    case 'contactsArrayMessage': {
      const contacts = (Array.isArray(body.contacts) ? body.contacts : []).filter(isObj).map((c: Json) => parseVcard(str(c.vcard), str(c.displayName)));
      return out('contato', null, null, { contacts });
    }

    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
    case 'pollCreationMessageV5': {
      const name = str(body.name) ?? 'Enquete';
      const options = (Array.isArray(body.options) ? body.options : []).map((o: Json) => str(o?.optionName)).filter((o: string | null): o is string => !!o);
      return out('enquete', name, null, { poll: { name, options, multiple: num(body.selectableOptionsCount) !== 1 } });
    }

    case 'templateMessage': {
      const t: Json = [body.hydratedTemplate, body.hydratedFourRowTemplate, body.fourRowTemplate].find(isObj) ?? {};
      const { media, meta } = headerMedia(t, raw);
      const text = joinText(str(t.hydratedContentText) ?? str(t.content?.namespace));
      return out(media?.kind ?? 'texto', text, media, {
        ...meta,
        title: str(t.hydratedTitleText),
        footer: str(t.hydratedFooterText),
        buttons: buttonsOf(t),
      });
    }
    case 'interactiveMessage': {
      const header: Json | null = isObj(body.header) ? body.header : null;
      const { media, meta } = headerMedia(header, raw);
      const flow: Json = isObj(body.nativeFlowMessage) ? body.nativeFlowMessage : {};
      return out(media?.kind ?? 'texto', str(body.body?.text), media, {
        ...meta,
        title: str(header?.title),
        footer: str(body.footer?.text),
        buttons: buttonsOf(flow),
      });
    }
    case 'buttonsMessage': {
      const { media, meta } = headerMedia(body, raw);
      return out(media?.kind ?? 'texto', str(body.contentText) ?? str(body.text), media, { ...meta, footer: str(body.footerText), buttons: buttonsOf(body) });
    }
    case 'listMessage': {
      const rows = (Array.isArray(body.sections) ? body.sections : []).flatMap((s: Json) => (Array.isArray(s?.rows) ? s.rows : []));
      const buttons = rows.map((r: Json) => str(r?.title)).filter((t: string | null): t is string => !!t).map((label: string) => ({ label }));
      return out('texto', joinText(str(body.title), str(body.description)), null, { footer: str(body.footerText), buttons });
    }

    // Respostas a botões e listas: o que a pessoa tocou, como texto.
    case 'buttonsResponseMessage':
      return out('texto', str(body.selectedDisplayText) ?? str(body.selectedButtonId), null);
    case 'templateButtonReplyMessage':
      return out('texto', str(body.selectedDisplayText) ?? str(body.selectedId), null);
    case 'listResponseMessage':
      return out('texto', joinText(str(body.title), str(body.description)) ?? str(body.singleSelectReply?.selectedRowId), null);
    case 'interactiveResponseMessage':
      return out('texto', str(body.body?.text) ?? str(body.nativeFlowResponseMessage?.name), null);

    case 'groupInviteMessage': {
      const group = str(body.groupName) ?? 'grupo';
      return out('outro', str(body.caption), null, { invite: { group } });
    }
    case 'eventMessage': {
      const name = str(body.name) ?? 'Evento';
      const start = num(body.startTime);
      return out('outro', null, null, { event: { name, description: str(body.description), startsAt: start ? new Date(start * 1000).toISOString() : null } });
    }

    default:
      return out('outro', null, null, { unsupported: type });
  }
}

/** Texto curto para citação e prévia, quando a mensagem não tem texto. */
export const KIND_SHORT: Record<MessageKind, string> = {
  texto: 'Mensagem',
  imagem: '📷 Imagem',
  audio: '🎤 Áudio',
  video: '🎬 Vídeo',
  documento: '📄 Documento',
  sticker: 'Figurinha',
  localizacao: '📍 Localização',
  contato: '👤 Contato',
  enquete: '📊 Enquete',
  outro: 'Mensagem',
};
