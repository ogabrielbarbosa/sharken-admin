import { canSetStatus, canTransition, phoneMatchCandidates, type Contact, type ContactStatus, type Lead } from '@lps/domain';
import type { Db } from './client';
import { getLead, logEvent, moveLead } from './leads';

export const NO_PHONE_MESSAGE = 'Lead sem celular: não dá para levar ao CRM.';

async function findOne(db: Db, column: string, values: string[]): Promise<Contact | null> {
  const { data, error } = await db.from('contacts').select().in(column, values).limit(1);
  if (error) throw new Error(error.message);
  return ((data as Contact[] | null) ?? [])[0] ?? null;
}

/**
 * Contato de um lead aprovado. Se o telefone já é contato (mesmo sem o nono dígito), liga o lead a ele
 * só quando o contato ainda não tem lead; senão mantém o vínculo e registra o evento.
 */
export async function createContactFromLead(db: Db, lead: Lead): Promise<Contact> {
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
    .insert({ name: lead.name, phone_e164: lead.phone_e164, lead_id: lead.id, origin: 'batch', status: 'novo', batch_id: lead.batch_id })
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
    const { data, error } = await db.rpc('crm_hoje_ids');
    if (error) throw new Error(error.message);
    const ids = (data as string[] | null) ?? [];
    if (!ids.length) return [];
    query = query.in('id', ids);
  } else if (opts.box !== 'todos') {
    query = query.in('status', BOX_STATUS[opts.box]);
  }
  if (opts.batchId) query = query.eq('batch_id', opts.batchId);
  // Vírgula, parênteses e curingas têm sentido na sintaxe do filtro; saem da busca.
  const term = opts.search?.replace(/[,()%*\\]/g, ' ').trim();
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

export async function countBoxes(db: Db): Promise<Record<CrmBox, number>> {
  const { data, error } = await db.rpc('crm_box_counts');
  if (error) throw new Error(error.message);
  return data as Record<CrmBox, number>;
}

export async function getContact(db: Db, id: string): Promise<Contact | null> {
  const { data, error } = await db.from('contacts').select().eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Contact | null;
}

export async function findContactByPhone(db: Db, e164: string): Promise<Contact | null> {
  return findOne(db, 'phone_e164', phoneMatchCandidates(e164));
}

export async function findContactByLid(db: Db, lid: string): Promise<Contact | null> {
  return findOne(db, 'whatsapp_lid', [lid]);
}

export type NewContact = Pick<Contact, 'name' | 'phone_e164' | 'origin'> & Partial<Pick<Contact, 'whatsapp_lid' | 'lead_id' | 'batch_id' | 'status' | 'comment'>>;

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
export async function setContactStatus(db: Db, contact: Pick<Contact, 'id' | 'status' | 'lead_id' | 'phone_e164'>, to: ContactStatus, eventData: object = {}): Promise<void> {
  if (!canSetStatus(contact.status, to)) throw new Error(`Não dá para mudar de ${contact.status} para ${to}.`);
  await updateContact(db, contact.id, { status: to, status_at: new Date().toISOString() });

  if (to === 'nao_contatar') {
    const { error } = await db.from('do_not_contact').upsert({ phone_e164: contact.phone_e164, reason: 'pediu para não receber mensagens' }, { onConflict: 'phone_e164', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  if (!contact.lead_id) return;

  await logEvent(db, contact.lead_id, `contato_${to}`, { contact_id: contact.id, ...eventData });
  const stage = to === 'perdido' ? 'sem_interesse' : to === 'nao_contatar' ? 'nao_contatar' : null;
  if (!stage) return;
  const lead = await getLead(db, contact.lead_id);
  if (lead && canTransition(lead.stage, stage)) await moveLead(db, lead, stage, {}, { contact_id: contact.id });
}
