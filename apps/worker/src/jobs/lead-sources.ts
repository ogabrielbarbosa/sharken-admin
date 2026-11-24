import { createAdminClient, getApifyToken, getBatch, getLead, logEvent, updateLead, type Db } from '@lps/db';
import { batchCountry, classifyLink, instagramHandle, mapPlaceToLead, mergeIncoming, parseMobileInput, type ApifyPlace, type Lead } from '@lps/domain';
import { APIFY_NOT_CONNECTED, buildPlaceInput, extractSiteFacts, MAPS_ACTOR, runActorSync } from '@lps/integrations';
import { trackApifyRun } from './apify-token';

const FAILED = 'Google: ';

const countryOf = async (db: Db, lead: Lead) => {
  const batch = lead.batch_id ? await getBatch(db, lead.batch_id) : null;
  return batch ? batchCountry(batch) : 'BR';
};

/**
 * Lê no Google o lugar do link colado e preenche o que falta no lead. Nunca lança: sem o Google, a análise segue com o
 * resto, e o motivo fica no lead e no histórico.
 */
export async function fillFromMaps(db: Db, lead: Lead, workspaceId: string | null, provisional: boolean): Promise<{ lead: Lead; error: string | null }> {
  // Já lido, ou já falhou nesta análise (o site pode reagendar a tarefa).
  if (!lead.maps_url || lead.place_id) return { lead, error: null };
  if (lead.error?.startsWith(FAILED)) return { lead, error: lead.error };
  try {
    const token = workspaceId ? await getApifyToken(createAdminClient(), workspaceId) : null;
    if (!token) throw new Error(APIFY_NOT_CONNECTED);
    const items = await runActorSync<ApifyPlace>(token, MAPS_ACTOR, buildPlaceInput(lead.maps_url), { timeoutMs: 180_000, onRun: trackApifyRun(workspaceId!, 'lead_maps', lead, MAPS_ACTOR) });
    const place = items.find((i) => i.placeId && i.title);
    if (!place) throw new Error('não encontrei esse lugar pelo link.');
    const { data } = await db.from('leads').select('id, name').eq('place_id', place.placeId).neq('id', lead.id).limit(1);
    const other = (data as { name: string }[] | null)?.[0];
    if (other) throw new Error(`esse lugar já é do lead ${other.name}.`);

    const incoming = mapPlaceToLead(place, lead.batch_id, await countryOf(db, lead));
    // O "site" do Google às vezes é o Instagram.
    incoming.instagram_url = classifyLink(incoming.website_url).instagramUrl;
    const patch: Partial<Lead> = { ...mergeIncoming(lead, incoming), ...(provisional ? { name: place.title } : {}) };
    if (patch.website_url && !lead.website_url) Object.assign(patch, { site_status: null, site_checks: [] });
    if (patch.instagram_url && !instagramHandle(patch.instagram_url)) delete patch.instagram_url;
    await updateLead(db, lead.id, patch);
    await logEvent(db, lead.id, 'google_lido', { place_id: place.placeId });
    return { lead: { ...lead, ...patch }, error: null };
  } catch (err) {
    const error = `${FAILED}${(err as Error).message}`;
    await updateLead(db, lead.id, { error });
    await logEvent(db, lead.id, 'erro_google', { message: (err as Error).message });
    return { lead: { ...lead, error }, error };
  }
}

/** Preenche com o que está escrito no site os dados que ainda faltam. Sem a IA, o lead segue com o que tem. */
export async function fillFromSite(db: Db, lead: Lead, provisional: boolean): Promise<Lead> {
  if (lead.site_status !== 'funcionando' || !lead.site_data || !lead.website_url) return lead;
  const missing = provisional || !lead.business_type || !lead.city || !lead.address || !lead.phone_raw;
  const patch: Partial<Lead> = {};
  if (!lead.description && lead.site_data.description) patch.description = lead.site_data.description;
  if (missing) {
    try {
      const facts = await extractSiteFacts(lead.website_url, lead.site_data);
      if (provisional && facts.name) patch.name = facts.name;
      if (!lead.business_type && facts.business_type) patch.business_type = facts.business_type;
      if (!lead.city && facts.city) patch.city = facts.city;
      if (!lead.address && facts.address) patch.address = facts.address;
      if (!lead.phone_raw && !lead.phone_e164 && facts.phone) Object.assign(patch, { phone_raw: facts.phone, phone_e164: parseMobileInput(facts.phone, await countryOf(db, lead)) });
    } catch (err) {
      console.error(`[site] dados do lead ${lead.id}: ${(err as Error).message}`);
    }
    if (provisional && !patch.name && lead.site_data.title) patch.name = lead.site_data.title.slice(0, 120);
  }
  if (!Object.keys(patch).length) return lead;
  await updateLead(db, lead.id, patch);
  return (await getLead(db, lead.id)) ?? { ...lead, ...patch };
}
