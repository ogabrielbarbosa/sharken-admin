import { statusAfterInbound, looksLikeStopRequest, type Contact, type HistoryEvent, type Message, type WhatsAppEvent } from '@lps/domain';
import type { Db } from './client';
import { createContact, findContactByLid, findContactByPhone, setContactStatus, updateContact } from './contacts';
import { enqueueJob } from './jobs';
import { getLead, logEvent, moveLead, updateLead } from './leads';
import { applyEdit, applyPollVote, applyReaction, applyRevoke, applyStatus, findByExternalId, findPendingEcho, insertMessage, messagePreview } from './messages';

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

type ConnectionEvent = Extract<WhatsAppEvent, { kind: 'connection' }>;
type ProfileEvent = Extract<WhatsAppEvent, { kind: 'profile' }>;

export async function setConnection(db: Db, e: Omit<ConnectionEvent, 'kind'> & { instance?: string | null; profilePicUrl?: string | null }, now: Date): Promise<void> {
  const row: Record<string, unknown> = { id: 1, state: e.state, updated_at: now.toISOString() };
  if (e.phone !== undefined && (e.phone || e.state !== 'conectado')) row.phone = e.phone;
  if (e.profileName !== undefined && (e.profileName || e.state !== 'conectado')) row.profile_name = e.profileName;
  if (e.statusReason !== undefined) row.status_reason = e.statusReason;
  if (e.instance !== undefined) row.instance = e.instance;
  if (e.profilePicUrl !== undefined) row.profile_pic_url = e.profilePicUrl;
  const { error } = await db.from('whatsapp_connection').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

/** Instância da Evolution em uso: a escolhida na tela de conexão, ou EVOLUTION_INSTANCE enquanto nenhuma foi escolhida. */
export async function getActiveInstance(db: Db, source: Record<string, string | undefined> = process.env): Promise<string | null> {
  const { data, error } = await db.from('whatsapp_connection').select('instance').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { instance: string | null } | null)?.instance || source.EVOLUTION_INSTANCE || null;
}

/** Foto e nome do perfil. Só troca o nome quando o contato ainda não tem um (nome igual ao número). */
async function ingestProfile(db: Db, e: ProfileEvent, now: Date): Promise<void> {
  let contact = e.phoneE164 ? await findContactByPhone(db, e.phoneE164) : null;
  if (!contact && e.lid) contact = await findContactByLid(db, e.lid);
  if (!contact) return;
  const patch: Partial<Contact> = {};
  if (e.avatarUrl) Object.assign(patch, { avatar_url: e.avatarUrl, avatar_checked_at: now.toISOString() });
  if (e.pushName && !/^[\d+ ]+$/.test(e.pushName) && contact.name === contact.phone_e164) patch.name = e.pushName;
  if (Object.keys(patch).length) await updateContact(db, contact.id, patch);
}

/** Acha o contato pelo telefone ou pelo LID, completando o LID quando só o telefone era conhecido. */
async function findContact(db: Db, e: Pick<MessageEvent, 'phoneE164' | 'lid'>): Promise<Contact | null> {
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
    if (!contact.responded_at) await updateContact(db, contact.id, { responded_at: respondedAt });
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

/** history: mensagem importada do histórico (não procura eco do painel). Devolve o contato quando gravou algo. */
async function ingestMessage(db: Db, e: MessageEvent, now: Date, history = false): Promise<Contact | null> {
  let contact = await findContact(db, e);
  if (!contact) {
    if (!e.phoneE164) {
      console.error('whatsapp_sem_telefone', { externalId: e.externalId, lid: e.lid });
      return null;
    }
    // Eco de mensagem enviada pelo celular: o pushName é o do próprio Gabriel, então o nome é o número.
    try {
      contact = await createContact(db, {
        name: e.fromMe ? e.phoneE164 : (e.pushName ?? e.phoneE164),
        phone_e164: e.phoneE164,
        whatsapp_lid: e.lid,
        origin: 'whatsapp_direto',
        status: e.fromMe ? 'contatado' : 'em_conversa',
        // Quem escreveu primeiro espera atendimento. O histórico importado entra fechado.
        chat_state: history ? 'fechado' : e.fromMe ? 'aberto' : 'pendente',
      });
    } catch (err) {
      // Outro webhook criou o mesmo número entre a busca e a criação: usa o contato que ganhou.
      if (!/duplicate key|unique/i.test((err as Error).message)) throw err;
      contact = await findContact(db, e);
      if (!contact) throw err;
    }
  }

  // Contato ainda sem nome (nome = número): usa o nome do perfil que veio com a mensagem.
  if (!e.fromMe && e.pushName && !/^[\d+ ]+$/.test(e.pushName) && contact.name === contact.phone_e164) {
    await updateContact(db, contact.id, { name: e.pushName });
    contact = { ...contact, name: e.pushName };
  }

  if (e.fromMe) {
    if (await messageExists(db, e.externalId)) return null;
    if (!history && e.text && !e.media) {
      const pending = await findPendingEcho(db, contact.id, e.text, new Date(now.getTime() - ECHO_WINDOW_MS));
      if (pending) {
        const { error } = await db.from('messages').update({ external_id: e.externalId, status: 'enviada' }).eq('id', pending.id).eq('status', 'pendente');
        if (error) throw new Error(error.message);
        return null;
      }
    }
  }

  // Reply: o trecho vem no webhook; sem ele, usa a original se ela já está no CRM.
  let quotedPreview = e.quoted?.text ?? null;
  if (e.quoted && !quotedPreview) {
    const original = await findByExternalId(db, contact.id, e.quoted.externalId);
    quotedPreview = original ? messagePreview(original) : null;
  }

  const row = await insertMessage(db, {
    contact_id: contact.id,
    direction: e.fromMe ? 'saida' : 'entrada',
    sent_from: e.fromMe ? 'celular' : null,
    kind: e.type ?? e.media?.kind ?? 'texto',
    body: e.text,
    meta: e.meta ?? {},
    media_mime: e.media?.mime ?? null,
    status: e.fromMe ? 'enviada' : 'recebida',
    external_id: e.externalId,
    at: e.at.toISOString(),
    quoted_external_id: e.quoted?.externalId ?? null,
    quoted_preview: quotedPreview,
  });
  if (!row) {
    // Já estava no CRM: no histórico, completa os detalhes de mensagens gravadas antes de existirem (meta vazio).
    if (history && Object.keys(e.meta ?? {}).length) await enrichMessage(db, e);
    return null;
  }
  if (e.edited) await db.from('messages').update({ edited_at: e.at.toISOString() }).eq('id', row.id);

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
  if (e.fromMe) return contact;

  if (e.text && looksLikeStopRequest(e.text) && contact.lead_id) {
    await logEvent(db, contact.lead_id, 'pedido_parar', { message_id: row.id });
  }
  await applyInboundStatus(db, contact, now);
  return contact;
}

async function enrichMessage(db: Db, e: MessageEvent): Promise<void> {
  const { error } = await db.from('messages').update({ kind: e.type, meta: e.meta }).eq('external_id', e.externalId).eq('meta', '{}');
  if (error) throw new Error(error.message);
}

/**
 * Importa mensagens do histórico (já ordenadas da mais antiga para a mais nova). Repetir é seguro:
 * o que já está no CRM é pulado. Toda conversa que recebeu mensagem importada termina fechada e sem não lidas.
 */
export async function importHistory(db: Db, events: HistoryEvent[], now: Date = new Date(), profiles: ProfileEvent[] = []): Promise<{ messages: number; contacts: number }> {
  const touched = new Set<string>();
  let messages = 0;
  for (const e of events) {
    // Reações e votos vêm depois da mensagem a que se referem (a lista está em ordem cronológica).
    if (e.kind !== 'message') {
      await ingestEvent(db, e, now);
      continue;
    }
    const contact = await ingestMessage(db, e, now, true);
    if (!contact) continue;
    messages++;
    touched.add(contact.id);
  }
  if (touched.size) {
    const { error } = await db.from('contacts').update({ chat_state: 'fechado', chat_state_at: now.toISOString(), unread_count: 0 }).in('id', [...touched]);
    if (error) throw new Error(error.message);
  }
  // O histórico vem sem nome: completa com a agenda da Evolution (só onde o nome ainda é o número).
  for (const p of profiles) await ingestProfile(db, p, now);
  return { messages, contacts: touched.size };
}

/** Aplica um evento do WhatsApp ao CRM (spec do CRM, "Recebimento"). */
export async function ingestEvent(db: Db, event: WhatsAppEvent, now: Date = new Date()): Promise<void> {
  if (event.kind === 'connection') return setConnection(db, event, now);
  if (event.kind === 'profile') return ingestProfile(db, event, now);
  if (event.kind === 'status') {
    await applyStatus(db, event.externalId, event.status);
    return;
  }
  // Reação, edição, exclusão e voto mexem numa mensagem que já está no CRM; se ela não está, não há o que mostrar.
  if (event.kind === 'reaction') {
    await applyReaction(db, event.targetExternalId, event.fromMe ? 'eu' : 'contato', event.emoji, event.at);
    return;
  }
  if (event.kind === 'edit') {
    await applyEdit(db, event.targetExternalId, event.text, event.at);
    return;
  }
  if (event.kind === 'revoke') {
    await applyRevoke(db, event.targetExternalId, event.at);
    return;
  }
  if (event.kind === 'poll_vote') {
    await applyPollVote(db, event.targetExternalId, event.fromMe ? 'eu' : 'contato', event.options);
    return;
  }
  await ingestMessage(db, event, now);
}
