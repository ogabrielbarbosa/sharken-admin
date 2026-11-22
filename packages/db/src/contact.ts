import { instagramHandle, type Lead } from '@lps/domain';
import type { Db } from './client';

/** Bloqueio e último contato valem por telefone: duas unidades iguais contam como uma. */
export async function getContactContext(db: Db, lead: Pick<Lead, 'id' | 'phone_e164' | 'place_id'> & { instagram_url?: string | null }) {
  const filters: string[] = [];
  if (lead.place_id) filters.push(`place_id.eq.${lead.place_id}`);
  if (lead.phone_e164) filters.push(`phone_e164.eq.${lead.phone_e164}`);
  const handle = instagramHandle(lead.instagram_url);
  if (handle) filters.push(`instagram_handle.eq.${handle}`);
  const { data: blocks } = filters.length ? await db.from('do_not_contact').select('id').or(filters.join(',')).limit(1) : { data: [] };

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

export async function addToDoNotContact(db: Db, entry: { phone_e164: string | null; place_id: string | null; instagram_url?: string | null; reason: string }) {
  if (entry.place_id) {
    const { error } = await db.from('do_not_contact').upsert(
      { place_id: entry.place_id, reason: entry.reason },
      { onConflict: 'place_id', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  const handle = instagramHandle(entry.instagram_url);
  if (handle) {
    const { error } = await db.from('do_not_contact').upsert(
      { instagram_handle: handle, reason: entry.reason },
      { onConflict: 'instagram_handle', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  if (entry.phone_e164) {
    await db.from('do_not_contact').upsert(
      { phone_e164: entry.phone_e164, reason: entry.reason },
      { onConflict: 'phone_e164', ignoreDuplicates: true },
    );
  }
}
