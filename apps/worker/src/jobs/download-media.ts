import { storeMessageMedia } from '@lps/db';
import { getWhatsAppProvider } from '@lps/integrations';
import { JobFailure, type Handler } from './types';

/** Baixa pela Evolution a mídia de uma mensagem recebida e guarda no bucket privado. */
export const downloadMediaJob: Handler = async (db, job) => {
  const { data, error } = await db.from('messages').select('id, contact_id, external_id, media_path, media_mime').eq('id', job.payload.message_id).maybeSingle();
  if (error) throw new Error(error.message);
  const message = data as { id: string; contact_id: string; external_id: string | null; media_path: string | null; media_mime: string | null } | null;
  if (!message || message.media_path) return;
  if (!message.external_id) throw new JobFailure('Mensagem sem id do WhatsApp.');

  const file = await getWhatsAppProvider().downloadMedia(message.external_id);
  if (!file) throw new JobFailure('A Evolution não devolveu o arquivo.');
  await storeMessageMedia(db, message, file.base64, file.mime ?? job.payload.mime ?? message.media_mime);
};
