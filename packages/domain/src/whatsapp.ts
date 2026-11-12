// Tipos neutros do WhatsApp. As implementações ficam em @lps/integrations.
import type { MessageKind, MessageMeta } from './contacts';

export type InboundMedia = { kind: 'imagem' | 'audio' | 'video' | 'documento' | 'sticker'; mime: string | null; url: string | null; base64: string | null };

/** Quem fez a ação (reação, voto): o número ou o LID do contato, ou eu mesmo. */
type Actor = { phoneE164: string | null; lid: string | null; fromMe: boolean };

export type WhatsAppEvent =
  | {
      kind: 'message';
      externalId: string;
      phoneE164: string | null;
      lid: string | null;
      pushName: string | null;
      fromMe: boolean;
      text: string | null;
      media: InboundMedia | null;
      at: Date;
      /** Só quando a mensagem responde a outra: id da citada e o trecho que veio junto. */
      quoted?: { externalId: string; text: string | null };
      /** Tipo no CRM. Sem mídia nem tipo próprio, é texto. */
      type: MessageKind;
      meta: MessageMeta;
      /** Veio do histórico já editada. */
      edited?: boolean;
    }
  | ({ kind: 'reaction'; targetExternalId: string; emoji: string | null; at: Date } & Actor)
  | { kind: 'edit'; targetExternalId: string; text: string | null; at: Date }
  | { kind: 'revoke'; targetExternalId: string; at: Date }
  | ({ kind: 'poll_vote'; targetExternalId: string; options: string[]; at: Date } & Actor)
  | { kind: 'status'; externalId: string; status: 'enviada' | 'entregue' | 'lida' | 'erro' }
  | { kind: 'connection'; state: 'conectado' | 'desconectado' | 'conectando'; phone?: string | null; profileName?: string | null; statusReason?: number | null }
  | { kind: 'profile'; phoneE164: string | null; lid: string | null; pushName: string | null; avatarUrl: string | null };

export type OutboundMedia = { kind: 'imagem' | 'video' | 'documento' | 'audio'; mime: string; base64: string; fileName: string };

/** Mensagem citada num reply: id no WhatsApp, quem mandou e o texto que aparece na citação. */
export type QuotedMessage = { externalId: string; fromMe: boolean; text: string };

export interface WhatsAppProvider {
  sendText(input: { phoneE164: string; text: string; clientMessageId: string; quoted?: QuotedMessage | null }): Promise<{ externalId: string }>;
  /** Imagem, vídeo e documento com legenda; áudio vai como mensagem de voz. */
  sendMedia(input: { phoneE164: string; media: OutboundMedia; caption: string | null; quoted?: QuotedMessage | null }): Promise<{ externalId: string }>;
  normalize(raw: unknown): WhatsAppEvent[];
  connectionQr(): Promise<string | null>;
  /** URL da foto de perfil do número, ou null quando a pessoa esconde a foto. */
  profilePictureUrl(phoneE164: string): Promise<string | null>;
  /** Baixa o arquivo de uma mensagem já recebida (Evolution: getBase64FromMediaMessage). */
  downloadMedia(externalId: string): Promise<{ base64: string; mime: string | null } | null>;
  /** Mensagens (e reações e votos) de conversas individuais guardadas no servidor desde `since`, da mais antiga para a mais nova. */
  recentMessages(since: Date): Promise<HistoryEvent[]>;
  /** Nome e foto dos contatos individuais guardados no servidor (a agenda que o WhatsApp sincroniza). */
  contactProfiles(): Promise<Extract<WhatsAppEvent, { kind: 'profile' }>[]>;
}

/** O que o histórico traz: mensagens, reações e votos de enquete. */
export type HistoryEvent = Extract<WhatsAppEvent, { kind: 'message' | 'reaction' | 'poll_vote' }>;
