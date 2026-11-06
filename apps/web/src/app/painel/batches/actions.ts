'use server';

import { createAdminClient, createBatch, getBatch } from '@lps/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startMapsSearch } from '@/lib/capture';

const num = (form: FormData, key: string) => Number(String(form.get(key) ?? '').replace(',', '.'));

export async function createBatchAction(form: FormData) {
  const db = createAdminClient();
  const batch = await createBatch(db, {
    location: String(form.get('location')),
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
  const db = createAdminClient();
  const batch = await getBatch(db, String(form.get('id')));
  if (batch) await startMapsSearch(batch);
  revalidatePath('/painel/batches');
}
