'use server';

import { createBatch, dismissDuplicate, findSearchTerm, getBatch, mergeLeads, saveSearchTerm } from '@lps/db';
import { findMunicipio, formatMunicipio, type BatchSource, type SiteRequirement } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APIFY_NOT_CONNECTED, startBatchSearch, startInstagramSearch, startMapsSearch, suggestSearchVariants, workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from '@/lib/auth';

const num = (form: FormData, key: string) => Number(String(form.get(key) ?? '').replace(',', '.'));
const strings = (form: FormData, key: string) => form.getAll(key).map(String).map((s) => s.trim()).filter(Boolean);

export async function createBatchAction(form: FormData) {
  const municipios = strings(form, 'location').map(findMunicipio);
  if (!municipios.length || municipios.some((m) => !m)) throw new Error('Escolha as cidades na lista de municípios.');
  const { workspace } = await getSession();
  if (!(await workspaceHasApify(workspace.id))) throw new Error(APIFY_NOT_CONNECTED);
  const db = await authedDb();
  const source: BatchSource = form.get('source') === 'maps' ? 'maps' : 'instagram';
  const businessType = String(form.get('businessType') ?? '').trim();
  const nicheTerms = strings(form, 'nicheTerm');
  const placeTerms = JSON.parse(String(form.get('placeTerms') || '{}')) as Record<string, string[]>;
  const site = String(form.get('site') ?? 'qualquer') as SiteRequirement;

  // As variações escolhidas ficam salvas para a próxima vez (sem passar pelo Claude de novo).
  if (source === 'instagram') {
    await saveSearchTerm(db, 'nicho', businessType, nicheTerms);
    for (const [city, variants] of Object.entries(placeTerms)) await saveSearchTerm(db, 'local', city, variants);
  }

  const batch = await createBatch(db, {
    locations: municipios.map((m) => formatMunicipio(m!)),
    businessType,
    quantity: num(form, 'quantity'),
    source,
    nicheTerms,
    locationTerms: [...new Set(Object.values(placeTerms).flat())],
    criteria: {
      minReviews: num(form, 'minReviews'),
      minRating: num(form, 'minRating'),
      minPhotos: num(form, 'minPhotos'),
      instagramActiveDays: num(form, 'instagramActiveDays'),
      recontactDays: num(form, 'recontactDays'),
      requireInstagramActive: form.get('requireInstagramActive') === 'true',
      requirePhone: form.get('requirePhone') === 'true',
      site: ['sem_site', 'com_site'].includes(site) ? site : 'qualquer',
    },
  });
  await startBatchSearch(batch);
  revalidatePath('/painel/batches');
  redirect('/painel/batches');
}

/**
 * Variações de um nicho ou de uma cidade: as salvas antes (por texto parecido) ou, sem nenhuma, as do Claude.
 * Com o Claude fora do ar, devolve só o que foi digitado.
 */
export async function suggestVariantsAction(kind: 'nicho' | 'local', term: string): Promise<{ variants: string[]; saved: boolean }> {
  const typed = term.trim().toLowerCase();
  if (!typed) return { variants: [], saved: false };
  const db = await authedDb();
  const saved = await findSearchTerm(db, kind, typed);
  if (saved) return { variants: saved.variants, saved: true };
  try {
    const variants = await suggestSearchVariants(kind, typed);
    return { variants: variants.length ? variants : [typed], saved: false };
  } catch {
    return { variants: [typed], saved: false };
  }
}

/** Várias de uma vez (o nicho e cada cidade), em paralelo: as ações do Next rodam uma por vez se chamadas separadas. */
export async function suggestManyVariantsAction(items: { kind: 'nicho' | 'local'; term: string }[]): Promise<{ variants: string[]; saved: boolean }[]> {
  return Promise.all(items.map((i) => suggestVariantsAction(i.kind, i.term)));
}

export async function retryBatchAction(form: FormData) {
  const db = await authedDb();
  const batch = await getBatch(db, String(form.get('id')));
  if (batch) await startBatchSearch(batch);
  revalidatePath('/painel/batches');
}

/** Roda a outra fonte em cima de um batch: os resultados cruzam com os leads dele, completam e entram os novos. */
export async function runSourceAction(batchId: string, source: BatchSource): Promise<{ error?: string }> {
  const { workspace } = await getSession();
  if (!(await workspaceHasApify(workspace.id))) return { error: APIFY_NOT_CONNECTED };
  const db = await authedDb();
  const batch = await getBatch(db, batchId);
  if (!batch) return { error: 'Batch não encontrado.' };
  if (batch.status === 'buscando' || batch.status === 'analisando') return { error: 'Espere a busca atual terminar.' };
  await (source === 'maps' ? startMapsSearch(batch) : startInstagramSearch(batch));
  revalidatePath(`/painel/batches/${batchId}`);
  revalidatePath('/painel/batches');
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
