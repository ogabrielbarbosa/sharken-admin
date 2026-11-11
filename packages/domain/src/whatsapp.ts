// Tipos neutros do WhatsApp. As implementações ficam em @lps/integrations.
export type InboundMedia = { kind: 'imagem' | 'audio' | 'video' | 'documento' | 'outro'; mime: string | null; url: string | null; base64: string | null };

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
    }
  | { kind: 'status'; externalId: string; status: 'enviada' | 'entregue' | 'lida' | 'erro' }
  | { kind: 'connection'; state: 'conectado' | 'desconectado' | 'conectando'; phone?: string | null; profileName?: string | null; statusReason?: number | null }
  | { kind: 'profile'; phoneE164: string | null; lid: string | null; pushName: string | null; avatarUrl: string | null };

export type OutboundMedia = { kind: 'imagem' | 'video' | 'documento' | 'audio'; mime: string; base64: string; fileName: string };

export interface WhatsAppProvider {
  sendText(input: { phoneE164: string; text: string; clientMessageId: string }): Promise<{ externalId: string }>;
  /** Imagem, vídeo e documento com legenda; áudio vai como mensagem de voz. */
  sendMedia(input: { phoneE164: string; media: OutboundMedia; caption: string | null }): Promise<{ externalId: string }>;
  normalize(raw: unknown): WhatsAppEvent[];
  connectionQr(): Promise<string | null>;
  /** URL da foto de perfil do número, ou null quando a pessoa esconde a foto. */
  profilePictureUrl(phoneE164: string): Promise<string | null>;
  /** Baixa o arquivo de uma mensagem já recebida (Evolution: getBase64FromMediaMessage). */
  downloadMedia(externalId: string): Promise<{ base64: string; mime: string | null } | null>;
}
