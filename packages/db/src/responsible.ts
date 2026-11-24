import type { Db } from './client';
import { requireWorkspace } from './scope';

export type ResponsibleEvent = { created_at: string; from_id: string | null; to_id: string | null; by_id: string | null };

/** Abre o atendimento e define o responsável (regra em `crm_open_chat`). Falso se já estava aberto ou fora do estado esperado. */
export async function openChat(db: Db, contactId: string, userId: string, from?: 'pendente' | 'fechado'): Promise<boolean> {
  const { data, error } = await db.rpc('crm_open_chat', { p_contact: contactId, p_workspace: requireWorkspace(db), p_user: userId, p_from: from ?? null });
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** Troca o responsável. O banco registra a troca. Só membro do workspace; só o lead pode ficar sem ninguém. */
export async function setResponsible(db: Db, table: 'leads' | 'contacts', id: string, userId: string | null, by: string): Promise<void> {
  const ws = requireWorkspace(db);
  if (!userId && table === 'contacts') throw new Error('Escolha o responsável pelo atendimento.');
  if (userId) {
    const { data, error } = await db.from('workspace_members').select('user_id').eq('workspace_id', ws).eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Essa pessoa não é membro do workspace.');
  }
  const { data, error } = await db.from(table).update({ responsible_id: userId, responsible_by: by, ...(table === 'contacts' ? { changed_by: by } : {}) }).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!(data as unknown[] | null)?.length) throw new Error(table === 'leads' ? 'Lead não encontrado.' : 'Contato não encontrado.');
}

/** Trocas de responsável de um atendimento, da mais nova para a mais antiga. */
export async function listResponsibleEvents(db: Db, contactId: string, limit = 20): Promise<ResponsibleEvent[]> {
  const { data, error } = await db.from('responsible_events').select('created_at, from_id, to_id, by_id')
    .eq('contact_id', contactId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ResponsibleEvent[];
}
