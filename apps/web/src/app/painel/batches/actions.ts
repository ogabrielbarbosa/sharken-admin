'use server';

import { createBatch, getBatch } from '@lps/db';
import { findMunicipio, formatMunicipio } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { startMapsSearch } from '@lps/integrations';

const num = (form: FormData, key: string) => Number(String(form.get(key) ?? '').replace(',', '.'));

export async function createBatchAction(form: FormData) {
  const municipio = findMunicipio(String(form.get('location') ?? ''));
  if (!municipio) throw new Error('Escolha a cidade na lista de municípios.');
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
