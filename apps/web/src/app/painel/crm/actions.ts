'use server';

import {
  closeDeal,
  createContact,
  getContract,
  getService,
  findContactByPhone,
  getContact,
  getLead,
  INVALID_NUMBER_MESSAGE,
  linkContactToLead,
  searchLeads,
  type LeadOption,
  listMessages,
  markRead,
  MEDIA_BUCKET,
  mediaExtension,
  retryMessage,
  saveLoomUrl,
  savePageUrl,
  sendMessage,
  openChat,
  setChatState,
  setResponsible,
  setContactStatus,
  updateContact,
  updateLead,
  getActiveInstance,
} from '@lps/db';
import { normalizeDocument, toMobileE164, validateCloseDeal, type CloseDealInput, type ContactStatus, type OutboundMedia } from '@lps/domain';
import { getWhatsAppProvider, suggestConversationReply } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { authedDb, getSession } from '@/lib/auth';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const STATUSES: ContactStatus[] = ['novo', 'contatado', 'follow_up', 'em_conversa', 'fechado', 'perdido', 'nao_contatar'];
const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.' });
const refresh = () => revalidatePath('/painel/crm');
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Provedor apontado para a instância escolhida em Configurações › WhatsApp. */
const whatsapp = async (db: Awaited<ReturnType<typeof authedDb>>) => getWhatsAppProvider(process.env, await getActiveInstance(db));

async function guarded<T>(fn: () => Promise<T>): Promise<Result<T extends object ? T : object>> {
  try {
    const out = await fn();
    refresh();
    return { ok: true, ...((out ?? {}) as object) } as Result<T extends object ? T : object>;
  } catch (err) {
    unstable_rethrow(err); // redirect do authedDb
    refresh(); // o balão com erro precisa aparecer
    return fail(err);
  }
}

/** Um clique, um contato. O erro volta como texto para a tela mostrar. `quotedExternalId`: reply a essa mensagem. */
export async function sendMessageAction(contactId: string, body: string, clientMessageId: string, quotedExternalId: string | null = null) {
  return guarded(async () => {
    if (!contactId || !text(body) || !clientMessageId) throw new Error('Escreva a mensagem antes de enviar.');
    const db = await authedDb();
    const message = await sendMessage(db, await whatsapp(db), { contactId, text: body, clientMessageId, quotedExternalId, sender: (await getSession()).user }, new Date());
    return { messageId: message.id };
  });
}

export async function retryMessageAction(messageId: string, clientMessageId: string) {
  return guarded(async () => {
    if (!messageId || !clientMessageId) throw new Error('Mensagem não encontrada.');
    const db = await authedDb();
    const message = await retryMessage(db, await whatsapp(db), messageId, clientMessageId, new Date(), (await getSession()).user);
    return { messageId: message.id };
  });
}

export async function setStatusAction(contactId: string, to: string) {
  return guarded(async () => {
    if (!STATUSES.includes(to as ContactStatus)) throw new Error('Status inválido.');
    if (to === 'fechado') throw new Error('Use "Fechar negócio" para fechar.');
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) throw new Error('Contato não encontrado.');
    await setContactStatus(db, contact, to as ContactStatus);
  });
}

/** Data e anotação do follow-up, ou `null` na data para remover. */
export async function saveFollowUpAction(contactId: string, date: string | null, note: string | null) {
  return guarded(async () => {
    const db = await authedDb();
    if (!(await getContact(db, contactId))) throw new Error('Contato não encontrado.');
    if (!date) {
      await updateContact(db, contactId, { follow_up_at: null, follow_up_note: null });
      return;
    }
    const at = new Date(date);
    if (Number.isNaN(at.getTime())) throw new Error('Data do follow-up inválida.');
    await updateContact(db, contactId, { follow_up_at: at.toISOString(), follow_up_note: text(note) || null });
  });
}

async function leadOf(db: Awaited<ReturnType<typeof authedDb>>, contactId: string) {
  const contact = await getContact(db, contactId);
  if (!contact?.lead_id) throw new Error('Este contato não tem lead.');
  return contact.lead_id;
}

/** Link da página ou do Loom do lead ligado ao contato. Em `crm` só grava o link, sem mudar de etapa. */
export async function updateContactLinkAction(contactId: string, kind: 'pagina' | 'video', url: string) {
  return guarded(async () => {
    if (kind !== 'pagina' && kind !== 'video') throw new Error('Tipo de link inválido.');
    const db = await authedDb();
    const leadId = await leadOf(db, contactId);
    const out = kind === 'pagina' ? await savePageUrl(db, leadId, url) : await saveLoomUrl(db, leadId, url, (await getSession()).user.id);
    if (!out.ok) throw new Error(out.error);
    return out.warning ? { warning: out.warning } : {};
  });
}

export async function markInvalidNumberAction(contactId: string) {
  return guarded(async () => {
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) throw new Error('Contato não encontrado.');
    if (contact.status === 'perdido') return; // já está perdido
    await setContactStatus(db, contact, 'perdido', { motivo: INVALID_NUMBER_MESSAGE });
    if (contact.lead_id) await updateLead(db, contact.lead_id, { exit_reason: INVALID_NUMBER_MESSAGE });
  });
}

/** Só devolve o texto para o campo. Nunca envia. */
export async function suggestReplyAction(contactId: string): Promise<{ text?: string; error?: string }> {
  try {
    const db = await authedDb();
    const contact = await getContact(db, contactId);
    if (!contact) return { error: 'Contato não encontrado.' };
    const lead = contact.lead_id ? await getLead(db, contact.lead_id) : null;
    const messages = await listMessages(db, contactId, 20);
    if (!messages.some((m) => m.direction === 'entrada')) return { error: 'Ainda não há mensagem recebida para responder.' };
    return { text: await suggestConversationReply(lead, contact.name, messages) };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : 'Não foi possível sugerir a resposta.' };
  }
}

/** Contato manual: nome e celular. Rejeita número repetido, com ou sem o nono dígito. */
export async function createContactAction(name: string, phone: string): Promise<Result<{ contactId: string }>> {
  try {
    const cleanName = text(name);
    if (!cleanName) throw new Error('Informe o nome.');
    const mobile = toMobileE164(phone);
    if (!mobile) throw new Error('Informe um celular válido, com DDD.');
    const db = await authedDb();
    const other = await findContactByPhone(db, mobile);
    if (other) throw new Error(`Este número já é do contato ${other.name}.`);
    const { user } = await getSession();
    const created = await createContact(db, { name: cleanName, phone_e164: mobile, origin: 'manual', status: 'novo', responsible_id: user.id, responsible_by: user.id });
    refresh();
    return { ok: true, contactId: created.id };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err);
  }
}

/** Zera as não lidas. Sem revalidar: a tela já atualiza pelo Realtime e pelo router do cliente. */
export async function markReadAction(contactId: string): Promise<void> {
  try {
    await markRead(await authedDb(), contactId);
  } catch (err) {
    unstable_rethrow(err);
  }
}

/** Nome do contato, editado direto no painel. Vazio não salva. */
export async function renameContactAction(contactId: string, name: string) {
  return guarded(async () => {
    const value = text(name).slice(0, 120);
    if (!value) throw new Error('O nome não pode ficar vazio.');
    await updateContact(await authedDb(), contactId, { name: value });
  });
}

/** Comentário interno do lead ligado ao contato. */
export async function saveLeadCommentAction(contactId: string, comment: string) {
  return guarded(async () => {
    const db = await authedDb();
    const leadId = await leadOf(db, contactId);
    await updateLead(db, leadId, { comment: text(comment) || null });
  });
}

/** Liga o contato a um lead, ou desliga com `leadId` nulo. Um lead pode ter vários contatos. */
export async function linkLeadAction(contactId: string, leadId: string | null) {
  return guarded(async () => {
    const db = await authedDb();
    await linkContactToLead(db, contactId, leadId);
    revalidatePath('/painel/batches', 'layout');
  });
}

export async function searchLeadsAction(term: string): Promise<LeadOption[]> {
  try {
    return await searchLeads(await authedDb(), text(term));
  } catch (err) {
    unstable_rethrow(err);
    return [];
  }
}

/** QR da Evolution para reconectar. `qr` vem nulo quando a instância já está conectada. */
export async function connectionQrAction(): Promise<{ ok: true; qr: string | null } | { ok: false; error: string }> {
  try {
    const db = await authedDb();
    let provider;
    try {
      provider = await whatsapp(db);
    } catch {
      return { ok: false, error: 'Configure EVOLUTION_URL e EVOLUTION_API_KEY para conectar.' };
    }
    return { ok: true, qr: await provider.connectionQr() };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err);
  }
}

export type CloseDealResult = { ok: true; contractId: string; clientId: string } | { ok: false; error: string; fields?: Record<string, string> };

/** Fechar negócio: valida de novo no servidor e grava tudo numa transação (função close_deal). */
export async function closeDealAction(input: CloseDealInput): Promise<CloseDealResult> {
  try {
    const clean: CloseDealInput = {
      contact_id: text(input.contact_id),
      request_id: text(input.request_id) || undefined,
      client: {
        legal_name: text(input.client.legal_name),
        document: normalizeDocument(text(input.client.document)),
        contact_name: text(input.client.contact_name),
        email: text(input.client.email),
        phone: text(input.client.phone).replace(/\D/g, ''),
        address: text(input.client.address),
        location: text(input.client.location),
      },
      service: { ...input.service, name: text(input.service.name), notes: text(input.service.notes) },
      payment: input.payment,
    };
    const fields = validateCloseDeal(clean);
    if (Object.keys(fields).length) return { ok: false, error: 'Corrija os campos marcados.', fields };
    const db = await authedDb();
    const contractId = await closeDeal(db, clean);
    const contract = await getContract(db, contractId);
    const service = contract && (await getService(db, contract.service_id));
    if (!service) throw new Error('Contrato não encontrado.');
    revalidatePath('/painel', 'layout');
    return { ok: true, contractId, clientId: service.client_id };
  } catch (err) {
    unstable_rethrow(err);
    // Só as mensagens que a própria função escreve em português chegam à tela; o resto vira texto genérico.
    const known = err instanceof Error && /^(Contato não encontrado|Contato marcado como Não contatar)/.test(err.message);
    return { ok: false, error: known ? (err as Error).message : 'Não foi possível fechar o negócio. Confira os dados e tente de novo.' };
  }
}

/** Abrir um atendimento pendente: passa para aberto. Só muda se ainda estiver pendente. */
export async function attendChatAction(contactId: string): Promise<Result> {
  return guarded(async () => { await openChat(await authedDb(), contactId, (await getSession()).user.id, 'pendente'); });
}

export async function closeChatAction(contactId: string): Promise<Result> {
  return guarded(async () => { await setChatState(await authedDb(), contactId, 'fechado'); });
}

export async function reopenChatAction(contactId: string): Promise<Result> {
  return guarded(async () => { await openChat(await authedDb(), contactId, (await getSession()).user.id); });
}

export async function setChatResponsibleAction(contactId: string, userId: string): Promise<Result> {
  return guarded(async () => { await setResponsible(await authedDb(), 'contacts', contactId, userId, (await getSession()).user.id); });
}

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

function mediaKind(mime: string, asAudio: boolean): OutboundMedia['kind'] {
  if (asAudio || mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  return 'documento';
}

/**
 * Arquivo ou áudio gravado no painel: guarda no bucket (o balão mostra pelo caminho) e envia pela Evolution.
 * FormData: contactId, clientMessageId, caption, file, audio ("1" para mensagem de voz), quotedExternalId (reply, opcional).
 */
export async function sendMediaAction(form: FormData) {
  return guarded(async () => {
    const contactId = text(form.get('contactId'));
    const clientMessageId = text(form.get('clientMessageId'));
    const file = form.get('file');
    if (!contactId || !clientMessageId || !(file instanceof File) || !file.size) throw new Error('Escolha um arquivo para enviar.');
    if (file.size > MAX_MEDIA_BYTES) throw new Error('Arquivo maior que 16 MB.');
    const db = await authedDb();
    const mime = file.type || 'application/octet-stream';
    const kind = mediaKind(mime, form.get('audio') === '1');
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${contactId}/saida-${clientMessageId}.${mediaExtension(mime)}`;
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, buffer, { contentType: mime, upsert: true });
    if (error) throw new Error(`Falha ao guardar o arquivo: ${error.message}`);
    const message = await sendMessage(
      db,
      await whatsapp(db),
      { contactId, text: text(form.get('caption')), clientMessageId, sender: (await getSession()).user, quotedExternalId: text(form.get('quotedExternalId')) || null, media: { kind, mime, base64: buffer.toString('base64'), fileName: file.name || `arquivo.${mediaExtension(mime)}`, path } },
      new Date(),
    );
    return { messageId: message.id };
  });
}

/** Nota interna: fica na conversa, não vai para o WhatsApp. */
export async function saveNoteAction(contactId: string, body: string) {
  return guarded(async () => {
    const note = text(body);
    if (!contactId || !note) throw new Error('Escreva a nota antes de salvar.');
    const db = await authedDb();
    const { user } = await getSession();
    const { error } = await db.from('messages').insert({ contact_id: contactId, direction: 'nota', kind: 'texto', body: note, status: 'recebida', sent_from: 'painel', sent_by: user.id, sent_by_email: user.email, at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  });
}
