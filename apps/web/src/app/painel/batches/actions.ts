'use server';

import { createBatch, getBatch } from '@lps/db';
import { findMunicipio, formatMunicipio } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { APIFY_NOT_CONNECTED, startMapsSearch, workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from '@/lib/auth';

const num = (form: FormData, key: string) => Number(String(form.get(key) ?? '').replace(',', '.'));

export async function createBatchAction(form: FormData) {
  const municipio = findMunicipio(String(form.get('location') ?? ''));
  if (!municipio) throw new Error('Escolha a cidade na lista de municípios.');
  const { workspace } = await getSession();
  if (!(await workspaceHasApify(workspace.id))) throw new Error(APIFY_NOT_CONNECTED);
  const db = await authedDb();
  const batch = await createBatch(db, {
    location: formatMunicipio(municipio),
    businessType: String(form.get('businessType')),
    quantity: num(form, 'quantity'),
    criteria: {
      minReviews: num(form, 'minReviews'),
      minRating: num(form, 'minRating'),
      minPhotos: num(form, 'minPhotos'),
      instagramActiveDays: num(form, 'instagramActiveDays'),
      recontactDays: num(form, 'recontactDays'),
    },
  });
  await startMapsSearch(batch);
  revalidatePath('/painel/batches');
  redirect('/painel/batches');
}

export async function retryBatchAction(form: FormData) {
  const db = await authedDb();
  const batch = await getBatch(db, String(form.get('id')));
  if (batch) await startMapsSearch(batch);
  revalidatePath('/painel/batches');
}
