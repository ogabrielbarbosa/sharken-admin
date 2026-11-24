'use server';

import { createBatch, createProfileBatch, dismissDuplicate, findSearchTerm, getBatch, mergeLeads, saveSearchTerm, updateBatch } from '@lps/db';
import { cityName, findMunicipio, findWorldCity, formatMunicipio, MAX_NETWORK_PROFILES, profileHandle, searchWorldCities, worldCitiesNear, type BatchSource, type Place, type ProfileRelation, type SiteRequirement, type WorldCity } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APIFY_NOT_CONNECTED, startBatchSearch, startInstagramSearch, startMapsSearch, suggestSearchVariants, workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from '@/lib/auth';
import { worldCities } from '@/lib/world-cities';

const num = (form: FormData, key: string) => Number(String(form.get(key) ?? '').replace(',', '.'));
const strings = (form: FormData, key: string) => form.getAll(key).map(String).map((s) => s.trim()).filter(Boolean);

/** Confere as cidades nas listas (IBGE e mundo). Um batch é de um país só: o idioma e o país da busca valem para ele todo. */
async function resolveCities(typed: string[]): Promise<{ locations: string[]; places: Place[]; country: string }> {
  const locations: string[] = [];
  const places: Place[] = [];
  for (const t of typed) {
    const m = findMunicipio(t);
    const city = m ? null : findWorldCity(await worldCities(), t);
    if (!m && !city) throw new Error('Escolha as cidades na lista.');
    locations.push(m ? formatMunicipio(m) : city!.location);
    if (city) places.push({ location: city.location, country: city.country, lat: city.lat, lng: city.lng });
  }
  if (!locations.length) throw new Error('Escolha as cidades na lista.');
  const countries = new Set([...places.map((p) => p.country), ...(places.length < locations.length ? ['BR'] : [])]);
  if (countries.size > 1) throw new Error('Escolha cidades de um país só por batch.');
  return { locations, places, country: [...countries][0] };
}

export async function searchWorldCitiesAction(query: string): Promise<WorldCity[]> {
  await getSession();
  return searchWorldCities(await worldCities(), query.slice(0, 80));
}

export async function worldCitiesNearAction(location: string, radiusKm: number): Promise<(WorldCity & { km: number })[]> {
  await getSession();
  return worldCitiesNear(await worldCities(), location, Math.min(radiusKm, 100));
}

const batchNameFrom = (form: FormData) => String(form.get('name') ?? '').trim().slice(0, 80);

const criteriaFrom = (form: FormData, site: SiteRequirement) => ({
  minReviews: num(form, 'minReviews'),
  minRating: num(form, 'minRating'),
  minPhotos: num(form, 'minPhotos'),
  instagramActiveDays: num(form, 'instagramActiveDays'),
  recontactDays: num(form, 'recontactDays'),
  requireInstagramActive: form.get('requireInstagramActive') === 'true',
  requirePhone: form.get('requirePhone') === 'true',
  site: ['sem_site', 'com_site'].includes(site) ? site : ('qualquer' as const),
});

/** Batch a partir de um perfil do Instagram: quem ele segue, os seguidores dele ou os dois. */
async function createFromProfile(form: FormData) {
  const profile = profileHandle(String(form.get('profile') ?? ''));
  if (!profile) throw new Error('Cole o link de um perfil do Instagram.');
  const asked = strings(form, 'relation');
  const relations = (['following', 'followers'] as ProfileRelation[]).filter((r) => asked.includes(r));
  if (!relations.length) throw new Error('Escolha seguindo, seguidores ou os dois.');
  const country = String(form.get('country') ?? 'BR');
  const site = String(form.get('site') ?? 'qualquer') as SiteRequirement;
  return createProfileBatch(await authedDb(), {
    name: batchNameFrom(form),
    profile,
    relations,
    country: /^[A-Z]{2}$/.test(country) ? country : 'BR',
    businessType: String(form.get('businessType') ?? ''),
    quantity: Math.min(Math.max(1, Math.floor(num(form, 'quantity')) || 1), Math.floor(MAX_NETWORK_PROFILES / relations.length)),
    criteria: { ...criteriaFrom(form, site), allowNoContact: form.get('requireContact') !== 'true' },
  });
}

export async function createBatchAction(form: FormData) {
  const { workspace } = await getSession();
  if (!(await workspaceHasApify(workspace.id))) throw new Error(APIFY_NOT_CONNECTED);
  const batch = form.get('source') === 'instagram_profile' ? await createFromProfile(form) : await createFromSearch(form);
  await startBatchSearch(batch);
  revalidatePath('/painel/batches');
  revalidatePath('/painel/leads');
  redirect('/painel/batches');
}

async function createFromSearch(form: FormData) {
  const { locations, places, country } = await resolveCities(strings(form, 'location'));
  const db = await authedDb();
  const source: BatchSource = form.get('source') === 'maps' ? 'maps' : 'instagram';
  const businessType = String(form.get('businessType') ?? '').trim();
  const nicheTerms = strings(form, 'nicheTerm');
  const placeTerms = JSON.parse(String(form.get('placeTerms') || '{}')) as Record<string, string[]>;
  const site = String(form.get('site') ?? 'qualquer') as SiteRequirement;

  // As variações escolhidas ficam salvas para a próxima vez (sem passar pelo Claude de novo).
  if (source === 'instagram' || country !== 'BR') {
    await saveSearchTerm(db, 'nicho', businessType, nicheTerms, country);
    for (const [city, variants] of Object.entries(placeTerms)) await saveSearchTerm(db, 'local', city, variants, country);
  }

  return createBatch(db, {
    name: batchNameFrom(form),
    locations,
    places,
    businessType,
    quantity: num(form, 'quantity'),
    source,
    nicheTerms,
    locationTerms: [...new Set(Object.values(placeTerms).flat())],
    criteria: criteriaFrom(form, site),
  });
}

/**
 * Variações de um nicho ou de uma cidade: as salvas antes (por texto parecido) ou, sem nenhuma, as do Claude.
 * Com o Claude fora do ar, devolve só o que foi digitado.
 */
export async function suggestVariantsAction(kind: 'nicho' | 'local', term: string, country = 'BR'): Promise<{ variants: string[]; saved: boolean }> {
  const typed = term.trim().toLowerCase();
  if (!typed) return { variants: [], saved: false };
  const db = await authedDb();
  const saved = await findSearchTerm(db, kind, typed, country);
  if (saved) return { variants: saved.variants, saved: true };
  // Cidade de fora chega por extenso ("austin, texas, estados unidos"); sozinha, a busca usa só o nome.
  const fallback = [kind === 'local' ? cityName(typed) : typed];
  try {
    const variants = await suggestSearchVariants(kind, typed, country);
    return { variants: variants.length ? variants : fallback, saved: false };
  } catch {
    return { variants: fallback, saved: false };
  }
}

/** Várias de uma vez (o nicho e cada cidade), em paralelo: as ações do Next rodam uma por vez se chamadas separadas. */
export async function suggestManyVariantsAction(items: { kind: 'nicho' | 'local'; term: string }[], country = 'BR'): Promise<{ variants: string[]; saved: boolean }[]> {
  return Promise.all(items.map((i) => suggestVariantsAction(i.kind, i.term, country)));
}

export async function retryBatchAction(form: FormData) {
  const db = await authedDb();
  const batch = await getBatch(db, String(form.get('id')));
  if (batch && batch.source !== 'manual') await startBatchSearch(batch);
  revalidatePath('/painel/batches');
}

/** Roda a outra fonte em cima de um batch: os resultados cruzam com os leads dele, completam e entram os novos. */
export async function runSourceAction(batchId: string, source: BatchSource): Promise<{ error?: string }> {
  const { workspace } = await getSession();
  if (!(await workspaceHasApify(workspace.id))) return { error: APIFY_NOT_CONNECTED };
  const db = await authedDb();
  const batch = await getBatch(db, batchId);
  if (!batch) return { error: 'Batch não encontrado.' };
  if (batch.source === 'manual') return { error: 'Batch manual não tem busca.' };
  if (batch.source === 'instagram_profile' || source === 'instagram_profile') return { error: 'Batch de perfil não tem busca por cidade.' };
  if (batch.status === 'buscando' || batch.status === 'analisando') return { error: 'Espere a busca atual terminar.' };
  await (source === 'maps' ? startMapsSearch(batch) : startInstagramSearch(batch));
  revalidatePath(`/painel/batches/${batchId}`);
  revalidatePath('/painel/batches');
  return {};
}

/** Vazio volta para o nome montado pela fonte e pelo tipo de negócio. */
export async function renameBatchAction(batchId: string, name: string): Promise<{ error?: string }> {
  try {
    await updateBatch(await authedDb(), batchId, { name: name.trim().slice(0, 80) || null });
  } catch {
    return { error: 'Não foi possível mudar o nome.' };
  }
  revalidatePath('/painel', 'layout');
  return {};
}

export async function mergeDuplicateAction(form: FormData) {
  const db = await authedDb();
  await mergeLeads(db, String(form.get('a')), String(form.get('b')));
  revalidatePath('/painel/batches/duplicados');
}

export async function dismissDuplicateAction(form: FormData) {
  const db = await authedDb();
  await dismissDuplicate(db, String(form.get('a')), String(form.get('b')));
  revalidatePath('/painel/batches/duplicados');
}
