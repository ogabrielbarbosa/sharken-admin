import { canSetStatus, canTransition, phoneMatchCandidates, type ChatState, type Contact, type ContactStatus, type Lead } from '@lps/domain';
import type { Db } from './client';
import { workspaceOf } from './scope';
import { getLead, logEvent, moveLead } from './leads';

export const NO_PHONE_MESSAGE = 'Lead sem celular: não dá para levar ao CRM.';

async function findOne(db: Db, column: string, values: string[]): Promise<Contact | null> {
  const { data, error } = await db.from('contacts').select().in(column, values).limit(1);
  if (error) throw new Error(error.message);
  return ((data as Contact[] | null) ?? [])[0] ?? null;
}

/** Conversa nova de um lead: herda o responsável dele; sem um, fica com quem a criou (sem ninguém, o banco usa o dono). */
function responsibleOf(lead: Lead, actor?: string) {
  return actor ? { responsible_id: lead.responsible_id ?? actor, responsible_by: actor } : {};
}

/**
 * Contato de um lead aprovado. Se o telefone já é contato (mesmo sem o nono dígito), liga o lead a ele
 * só quando o contato ainda não tem lead; senão mantém o vínculo e registra o evento.
 */
export async function createContactFromLead(db: Db, lead: Lead, actor?: string): Promise<Contact> {
  if (!lead.phone_e164) throw new Error(NO_PHONE_MESSAGE);

  const linked = await findOne(db, 'lead_id', [lead.id]);
  if (linked) return linked;

  const existing = await findOne(db, 'phone_e164', phoneMatchCandidates(lead.phone_e164));
  if (existing) {
    const free = !existing.lead_id;
    if (!free) {
      await logEvent(db, lead.id, 'contato_ligado', { contact_id: existing.id, vinculado: false, lead_do_contato: existing.lead_id });
      return existing;
    }
    const { data, error } = await db.from('contacts').update({ lead_id: lead.id }).eq('id', existing.id).select().single();
    if (error) throw new Error(error.message);
    await logEvent(db, lead.id, 'contato_ligado', { contact_id: existing.id, vinculado: true });
    return data as Contact;
  }

  const { data, error } = await db
    .from('contacts')
    .insert({ name: lead.name, phone_e164: lead.phone_e164, lead_id: lead.id, origin: 'batch', status: 'novo', batch_id: lead.batch_id, ...responsibleOf(lead, actor) })
    .select()
    .single();
  if (error) {
    // Corrida com outro contato do mesmo telefone: usa o que ganhou.
    const raced = await findOne(db, 'phone_e164', phoneMatchCandidates(lead.phone_e164));
    if (raced) return raced;
    throw new Error(error.message);
  }
  await logEvent(db, lead.id, 'contato_criado', { contact_id: (data as Contact).id });
  return data as Contact;
}

export type CrmBox = 'hoje' | 'novos' | 'aguardando' | 'em_conversa' | 'fechados' | 'perdidos' | 'todos';

const BOX_STATUS: Record<Exclude<CrmBox, 'hoje' | 'todos'>, ContactStatus[]> = {
  novos: ['novo'],
  aguardando: ['contatado', 'follow_up'],
  em_conversa: ['em_conversa'],
  fechados: ['fechado'],
  perdidos: ['perdido', 'nao_contatar'],
};

const LIST_LIMIT = 500;

export async function listContacts(db: Db, opts: { box: CrmBox; search?: string; batchId?: string }): Promise<Contact[]> {
  let query = db.from('contacts').select();
  if (opts.box === 'hoje') {
    const { data, error } = await db.rpc('crm_hoje_ids', { p_workspace: workspaceOf(db) });
    if (error) throw new Error(error.message);
    const ids = (data as string[] | null) ?? [];
    if (!ids.length) return [];
    query = query.in('id', ids);
  } else if (opts.box !== 'todos') {
    query = query.in('status', BOX_STATUS[opts.box]);
  }
  if (opts.batchId) query = query.eq('batch_id', opts.batchId);
  // Vírgula, parênteses e curingas têm sentido na sintaxe do filtro; saem da busca.
  const term = opts.search?.replace(/[,()%*"\\]/g, ' ').trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone_e164.ilike.%${term}%`);
  const { data, error } = await query.order('last_message_at', { ascending: false, nullsFirst: false }).limit(LIST_LIMIT);
  if (error) throw new Error(error.message);
  const contacts = data as Contact[];
  if (opts.box !== 'novos') return contacts;

  // Em Novos, a ordem é pela pontuação do lead.
  const leadIds = contacts.map((c) => c.lead_id).filter((id): id is string => !!id);
  const scores = new Map<string, number>();
  if (leadIds.length) {
    const { data: leads, error: leadsError } = await db.from('leads').select('id, score').in('id', leadIds);
    if (leadsError) throw new Error(leadsError.message);
    for (const l of leads as { id: string; score: number | null }[]) if (l.score !== null) scores.set(l.id, l.score);
  }
  const score = (c: Contact) => (c.lead_id ? (scores.get(c.lead_id) ?? -Infinity) : -Infinity);
  return [...contacts].sort((a, b) => score(b) - score(a));
}

export type ChatTab = ChatState;
export type ChatCounts = Record<ChatState, number> & { pendente_nao_lidas: number };

/** Lista do CRM por estado do atendimento (ou todos, com `state` nulo), mais recente primeiro. */
export async function listChats(db: Db, opts: { state: ChatState | null; search?: string }): Promise<Contact[]> {
  let query = db.from('contacts').select();
  if (opts.state) query = query.eq('chat_state', opts.state);
  const term = opts.search?.replace(/[,()%*"\\]/g, ' ').trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    query = query.or(digits.length >= 4 ? `name.ilike.%${term}%,phone_e164.ilike.%${digits}%` : `name.ilike.%${term}%`);
  }
  const { data, error } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(error.message);
  return data as Contact[];
}

export async function countChats(db: Db): Promise<ChatCounts> {
  const { data, error } = await db.rpc('crm_chat_counts', { p_workspace: workspaceOf(db) });
  if (error) throw new Error(error.message);
  return data as ChatCounts;
}

/** Muda o estado do atendimento. `from` evita corrida: só muda se ainda estiver no estado esperado. */
export async function setChatState(db: Db, id: string, to: ChatState, from?: ChatState): Promise<boolean> {
  let query = db.from('contacts').update({ chat_state: to, chat_state_at: new Date().toISOString() }).eq('id', id);
  if (from) query = query.eq('chat_state', from);
  const { data, error } = await query.select('id');
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}

export async function countBoxes(db: Db): Promise<Record<CrmBox, number>> {
  const { data, error } = await db.rpc('crm_box_counts', { p_workspace: workspaceOf(db) });
  if (error) throw new Error(error.message);
  return data as Record<CrmBox, number>;
}

export async function getContact(db: Db, id: string): Promise<Contact | null> {
  const { data, error } = await db.from('contacts').select().eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Contact | null;
}

export function getContactByLead(db: Db, leadId: string): Promise<Contact | null> {
  return findOne(db, 'lead_id', [leadId]);
}

export async function findContactByPhone(db: Db, e164: string): Promise<Contact | null> {
  return findOne(db, 'phone_e164', phoneMatchCandidates(e164));
}

export async function findContactByLid(db: Db, lid: string): Promise<Contact | null> {
  return findOne(db, 'whatsapp_lid', [lid]);
}

export type NewContact = Pick<Contact, 'name' | 'phone_e164' | 'origin'> & Partial<Pick<Contact, 'whatsapp_lid' | 'lead_id' | 'batch_id' | 'status' | 'comment' | 'chat_state' | 'avatar_url' | 'responsible_id' | 'responsible_by'>>;

export async function createContact(db: Db, row: NewContact): Promise<Contact> {
  const { data, error } = await db.from('contacts').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as Contact;
}

export async function updateContact(db: Db, id: string, patch: Partial<Contact>): Promise<void> {
  const { error } = await db.from('contacts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Mudança de status feita pelo Gabriel. Com lead ligado, registra o evento e mantém a etapa do lead
 * coerente: perdido vira sem_interesse e não contatar entra na lista de bloqueio (a retenção respeita).
 */
async function hasOtherActiveContact(db: Db, leadId: string, exceptId: string): Promise<boolean> {
  const { data, error } = await db.from('contacts').select('id, status').eq('lead_id', leadId);
  if (error) throw new Error(error.message);
  return ((data as Pick<Contact, 'id' | 'status'>[] | null) ?? []).some((c) => c.id !== exceptId && c.status !== 'perdido' && c.status !== 'nao_contatar');
}

export async function setContactStatus(db: Db, contact: Pick<Contact, 'id' | 'status' | 'lead_id' | 'phone_e164'>, to: ContactStatus, eventData: object = {}): Promise<void> {
  if (!canSetStatus(contact.status, to)) throw new Error(`Não dá para mudar de ${contact.status} para ${to}.`);
  if (to === 'nao_contatar') {
    // Primeiro o bloqueio: se o status falhar depois, o número já não recebe mensagem.
    const { error } = await db.from('do_not_contact').upsert({ phone_e164: contact.phone_e164, reason: 'pediu para não receber mensagens' }, { onConflict: 'phone_e164', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  const patch: Partial<Contact> = { status: to, status_at: new Date().toISOString() };
  if (to === 'perdido' || to === 'nao_contatar') patch.follow_up_at = null;
  await updateContact(db, contact.id, patch);

  if (!contact.lead_id) return;

  await logEvent(db, contact.lead_id, `contato_${to}`, { contact_id: contact.id, ...eventData });
  const stage = to === 'perdido' ? 'sem_interesse' : to === 'nao_contatar' ? 'nao_contatar' : null;
  if (!stage) return;
  // Um lead pode ter vários números: um perdido (ex.: sem WhatsApp) só tira o lead quando nenhum outro segue ativo.
  // Não contatar vale para o negócio todo: parar assim que pedirem.
  if (to === 'perdido' && (await hasOtherActiveContact(db, contact.lead_id, contact.id))) return;
  const lead = await getLead(db, contact.lead_id);
  if (lead && canTransition(lead.stage, stage)) await moveLead(db, lead, stage, {}, { contact_id: contact.id });
}

/** Todos os contatos (conversas) de cada lead, o mais recente primeiro. Um lead pode ter vários números. */
export async function listContactsOfLeads(db: Db, leadIds: string[]): Promise<Record<string, Contact[]>> {
  if (!leadIds.length) return {};
  const { data, error } = await db
    .from('contacts')
    .select()
    .in('lead_id', leadIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: Record<string, Contact[]> = {};
  for (const c of data as Contact[]) if (c.lead_id) (out[c.lead_id] ??= []).push(c);
  return out;
}

export const CONTACT_OF_OTHER_LEAD = 'Este número já é contato de outro lead. Desligue-o de lá antes.';

/**
 * Liga um contato a um lead (ou desliga, com `leadId` nulo). Um contato tem no máximo um lead;
 * um lead pode ter vários contatos. Trocar de lead exige desligar antes.
 */
export async function linkContactToLead(db: Db, contactId: string, leadId: string | null): Promise<void> {
  const contact = await getContact(db, contactId);
  if (!contact) throw new Error('Contato não encontrado.');
  if (contact.lead_id === leadId) return;

  if (!leadId) {
    await updateContact(db, contact.id, { lead_id: null });
    await logEvent(db, contact.lead_id!, 'contato_desligado', { contact_id: contact.id });
    return;
  }
  if (contact.lead_id) throw new Error(CONTACT_OF_OTHER_LEAD);
  const lead = await getLead(db, leadId);
  if (!lead) throw new Error('Lead não encontrado.');
  // Só preenche o batch quando o contato não tem: a origem real do contato não muda.
  await updateContact(db, contact.id, { lead_id: lead.id, ...(contact.batch_id ? {} : { batch_id: lead.batch_id }) });
  await logEvent(db, lead.id, 'contato_ligado', { contact_id: contact.id, vinculado: true, manual: true });
}

/**
 * Mais um número para o lead. Se o número já é contato sem lead, só liga; se é de outro lead, recusa.
 * Número novo vira contato manual, já ligado ao lead e ao batch dele.
 */
export async function addContactToLead(db: Db, leadId: string, input: { name: string; phone_e164: string }, actor?: string): Promise<Contact> {
  const lead = await getLead(db, leadId);
  if (!lead) throw new Error('Lead não encontrado.');
  const existing = await findContactByPhone(db, input.phone_e164);
  if (existing) {
    if (existing.lead_id === lead.id) return existing;
    if (existing.lead_id) throw new Error(CONTACT_OF_OTHER_LEAD);
    await linkContactToLead(db, existing.id, lead.id);
    return { ...existing, lead_id: lead.id };
  }
  const created = await createContact(db, { name: input.name, phone_e164: input.phone_e164, origin: 'manual', status: 'novo', lead_id: lead.id, batch_id: lead.batch_id, ...responsibleOf(lead, actor) });
  await logEvent(db, lead.id, 'contato_criado', { contact_id: created.id, manual: true });
  return created;
}

export type LeadOption = { id: string; name: string; city: string | null; stage: Lead['stage']; batch_id: string | null };

/** Busca de lead pelo nome, para ligar um contato. */
export async function searchLeads(db: Db, term: string, limit = 8): Promise<LeadOption[]> {
  const clean = term.replace(/[,()%*"\\]/g, ' ').trim();
  if (clean.length < 2) return [];
  const { data, error } = await db
    .from('leads')
    .select('id, name, city, stage, batch_id')
    .ilike('name', `%${clean}%`)
    .not('stage', 'in', '(analisando,descartado)')
    .order('stage_changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as LeadOption[];
}
