import { statusAfterInbound, looksLikeStopRequest, type Contact, type Message, type WhatsAppEvent } from '@lps/domain';
import type { Db } from './client';
import { createContact, findContactByLid, findContactByPhone, setContactStatus, updateContact } from './contacts';
import { enqueueJob } from './jobs';
import { getLead, logEvent, moveLead, updateLead } from './leads';
import { applyStatus, findPendingEcho, insertMessage } from './messages';

export const MEDIA_BUCKET = 'whatsapp-media';
const ECHO_WINDOW_MS = 60_000;

type MessageEvent = Extract<WhatsAppEvent, { kind: 'message' }>;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
};

/** Extensão do arquivo a partir do mime ("audio/ogg; codecs=opus" vira ogg). */
export function mediaExtension(mime: string | null): string {
  const base = (mime ?? '').split(';')[0]!.trim().toLowerCase();
  return EXT_BY_MIME[base] ?? (base.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin');
}

export function mediaPath(contactId: string, messageId: string, mime: string | null): string {
  return `${contactId}/${messageId}.${mediaExtension(mime)}`;
}

/** Guarda o arquivo no bucket privado e liga o caminho à mensagem. */
export async function storeMessageMedia(db: Db, message: Pick<Message, 'id' | 'contact_id'>, base64: string, mime: string | null): Promise<string> {
  const path = mediaPath(message.contact_id, message.id, mime);
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, Buffer.from(base64, 'base64'), { contentType: mime ?? 'application/octet-stream', upsert: true });
  if (error) throw new Error(`Falha ao guardar a mídia: ${error.message}`);
  const { error: updateError } = await db.from('messages').update({ media_path: path, media_mime: mime }).eq('id', message.id);
  if (updateError) throw new Error(updateError.message);
  return path;
}

async function setConnection(db: Db, state: string, now: Date): Promise<void> {
  const { error } = await db.from('whatsapp_connection').upsert({ id: 1, state, updated_at: now.toISOString() }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

/** Acha o contato pelo telefone ou pelo LID, completando o LID quando só o telefone era conhecido. */
async function findContact(db: Db, e: MessageEvent): Promise<Contact | null> {
  let contact = e.phoneE164 ? await findContactByPhone(db, e.phoneE164) : null;
  if (!contact && e.lid) contact = await findContactByLid(db, e.lid);
  if (contact && e.lid && !contact.whatsapp_lid) {
    await updateContact(db, contact.id, { whatsapp_lid: e.lid });
    contact = { ...contact, whatsapp_lid: e.lid };
  }
  return contact;
}

async function messageExists(db: Db, externalId: string): Promise<boolean> {
  const { data, error } = await db.from('messages').select('id').eq('external_id', externalId).limit(1);
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** Resposta de quem recebeu: avança o status, marca a primeira resposta e registra o evento no lead. */
async function applyInboundStatus(db: Db, contact: Contact, now: Date): Promise<void> {
  const to = statusAfterInbound(contact);
  const respondedAt = contact.responded_at ?? now.toISOString();
  if (to === contact.status) {
    if (!contact.responded_at && contact.status === 'em_conversa') await updateContact(db, contact.id, { responded_at: respondedAt });
    return;
  }
  const patch: Partial<Contact> = { responded_at: respondedAt, follow_up_at: null };
  if (contact.status === 'perdido') {
    // perdido -> em_conversa só existe por mensagem recebida; setContactStatus não permite.
    await updateContact(db, contact.id, { ...patch, status: to, status_at: now.toISOString() });
    if (contact.lead_id) {
      await logEvent(db, contact.lead_id, `contato_${to}`, { contact_id: contact.id, por: 'mensagem_recebida' });
      const lead = await getLead(db, contact.lead_id);
      if (lead?.stage === 'sem_interesse') await moveLead(db, lead, 'crm', {}, { contact_id: contact.id, por: 'mensagem_recebida' });
    }
  } else {
    await updateContact(db, contact.id, patch);
    await setContactStatus(db, contact, to, { por: 'mensagem_recebida' });
  }
  if (contact.lead_id) {
    const lead = await getLead(db, contact.lead_id);
    if (lead && !lead.responded_at) await updateLead(db, lead.id, { responded_at: respondedAt });
  }
}

async function ingestMessage(db: Db, e: MessageEvent, now: Date): Promise<void> {
  let contact = await findContact(db, e);
  if (!contact) {
    if (!e.phoneE164) {
      console.error('whatsapp_sem_telefone', { externalId: e.externalId, lid: e.lid });
      return;
    }
    // Eco de mensagem enviada pelo celular: o pushName é o do próprio Gabriel, então o nome é o número.
    try {
      contact = await createContact(db, {
        name: e.fromMe ? e.phoneE164 : (e.pushName ?? e.phoneE164),
        phone_e164: e.phoneE164,
        whatsapp_lid: e.lid,
        origin: 'whatsapp_direto',
        status: e.fromMe ? 'contatado' : 'em_conversa',
      });
    } catch (err) {
      // Outro webhook criou o mesmo número entre a busca e a criação: usa o contato que ganhou.
      if (!/duplicate key|unique/i.test((err as Error).message)) throw err;
      contact = await findContact(db, e);
      if (!contact) throw err;
    }
  }

  if (e.fromMe) {
    if (await messageExists(db, e.externalId)) return;
    if (e.text && !e.media) {
      const pending = await findPendingEcho(db, contact.id, e.text, new Date(now.getTime() - ECHO_WINDOW_MS));
      if (pending) {
        const { error } = await db.from('messages').update({ external_id: e.externalId, status: 'enviada' }).eq('id', pending.id).eq('status', 'pendente');
        if (error) throw new Error(error.message);
        return;
      }
    }
  }

  const row = await insertMessage(db, {
    contact_id: contact.id,
    direction: e.fromMe ? 'saida' : 'entrada',
    sent_from: e.fromMe ? 'celular' : null,
    kind: e.media?.kind ?? 'texto',
    body: e.text,
    media_mime: e.media?.mime ?? null,
    status: e.fromMe ? 'enviada' : 'recebida',
    external_id: e.externalId,
    at: e.at.toISOString(),
  });
  if (!row) return; // já recebida

  if (e.media) {
    let stored = false;
    if (e.media.base64) {
      try {
        await storeMessageMedia(db, row, e.media.base64, e.media.mime);
        stored = true;
      } catch (err) {
        console.error('whatsapp_midia_falhou', row.id, (err as Error).message); // a tarefa tenta de novo pela Evolution
      }
    }
    if (!stored) await enqueueJob(db, { type: 'download_media', payload: { message_id: row.id, url: e.media.url, mime: e.media.mime }, dedupeKey: `download_media:${row.id}` });
  }
  if (e.fromMe) return;

  if (e.text && looksLikeStopRequest(e.text) && contact.lead_id) {
    await logEvent(db, contact.lead_id, 'pedido_parar', { message_id: row.id });
  }
  await applyInboundStatus(db, contact, now);
}

/** Aplica um evento do WhatsApp ao CRM (spec do CRM, "Recebimento"). */
export async function ingestEvent(db: Db, event: WhatsAppEvent, now: Date = new Date()): Promise<void> {
  if (event.kind === 'connection') return setConnection(db, event.state, now);
  if (event.kind === 'status') {
    await applyStatus(db, event.externalId, event.status);
    return;
  }
  return ingestMessage(db, event, now);
}
