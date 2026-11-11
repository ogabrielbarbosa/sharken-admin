import { phoneMatchCandidates, type Contact, type Lead } from '@lps/domain';
import type { Db } from './client';
import { logEvent } from './leads';

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
