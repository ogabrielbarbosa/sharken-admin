import type { Lead } from '@lps/domain';
import type { Db } from './client';

/** Bloqueio e último contato valem por telefone: duas unidades iguais contam como uma. */
export async function getContactContext(db: Db, lead: Pick<Lead, 'id' | 'phone_e164' | 'place_id'>) {
  const filters = [`place_id.eq.${lead.place_id}`];
  if (lead.phone_e164) filters.push(`phone_e164.eq.${lead.phone_e164}`);
  const { data: blocks } = await db.from('do_not_contact').select('id').or(filters.join(',')).limit(1);

  let lastContactAt: Date | null = null;
  if (lead.phone_e164) {
    const { data } = await db
      .from('leads')
      .select('contacted_at')
      .eq('phone_e164', lead.phone_e164)
      .neq('id', lead.id)
      .not('contacted_at', 'is', null)
      .order('contacted_at', { ascending: false })
      .limit(1);
    const value = data?.[0]?.contacted_at as string | undefined;
    if (value) lastContactAt = new Date(value);
  }
  return { blocked: !!blocks?.length, lastContactAt };
}

export async function addToDoNotContact(db: Db, entry: { phone_e164: string | null; place_id: string; reason: string }) {
  const { error } = await db.from('do_not_contact').upsert(
    { place_id: entry.place_id, reason: entry.reason },
    { onConflict: 'place_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  if (entry.phone_e164) {
    await db.from('do_not_contact').upsert(
      { phone_e164: entry.phone_e164, reason: entry.reason },
      { onConflict: 'phone_e164', ignoreDuplicates: true },
    );
  }
}

export const SEND_EVENTS = ['contato_enviado', 'follow_up_enviado'];

export async function countEventsSince(db: Db, types: string[], since: Date, batchId?: string): Promise<number> {
  let query = db
    .from('events')
    .select(batchId ? 'id, leads!inner(batch_id)' : 'id', { count: 'exact', head: true })
    .in('type', types)
    .gte('created_at', since.toISOString());
  if (batchId) query = query.eq('leads.batch_id', batchId);
  const { count } = await query;
  return count ?? 0;
}
