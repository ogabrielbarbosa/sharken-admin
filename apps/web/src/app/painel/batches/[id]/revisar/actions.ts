'use server';

import { getLead, moveLead } from '@lps/db';
import type { Lead } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';

async function selected(form: FormData) {
  const db = await authedDb();
  const ids = form.getAll('ids').map(String);
  const leads = (await Promise.all(ids.map((id) => getLead(db, id)))).filter((l): l is Lead => !!l && l.stage === 'revisar');
  return { db, batchId: String(form.get('batchId')), leads };
}

/** Move os selecionados para Completar e abre a tela com eles, na ordem recebida. */
export async function advanceLeadsAction(form: FormData) {
  const { db, batchId, leads } = await selected(form);
  for (const lead of leads) await moveLead(db, lead, 'completar', { error: null });
  revalidatePath(`/painel/batches/${batchId}`, 'layout');
  redirect(`/painel/batches/${batchId}/completar?ids=${leads.map((l) => l.id).join(',')}`);
}

export async function discardLeadsAction(form: FormData) {
  const { db, batchId, leads } = await selected(form);
  for (const lead of leads) await moveLead(db, lead, 'descartado', { exit_reason: 'Descartado por você' });
  revalidatePath(`/painel/batches/${batchId}`, 'layout');
}
