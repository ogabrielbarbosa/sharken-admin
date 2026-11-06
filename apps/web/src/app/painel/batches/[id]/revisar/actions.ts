'use server';

import { enqueueJob, getLead, moveLead, type Db } from '@lps/db';
import { canAdvance, type Lead } from '@lps/domain';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';

async function advance(db: Db, lead: Lead): Promise<boolean> {
  if (lead.stage !== 'revisar' || !canAdvance(lead).allowed) return false;
  await moveLead(db, lead, 'gerando_material', { error: null });
  await enqueueJob(db, { type: 'generate_page', payload: { lead_id: lead.id }, dedupeKey: `generate_page:${lead.id}` });
  return true;
}

export async function advanceLeadAction(form: FormData) {
  const db = await authedDb();
  const lead = await getLead(db, String(form.get('leadId')));
  const batchId = String(form.get('batchId'));
  if (!lead) return;
  const reason = form.get('reason');
  const comment = form.get('comment');
  const merged = { ...lead, ...(reason !== null ? { reason: String(reason) } : {}), ...(comment !== null ? { comment: String(comment) } : {}) };
  const moved = await advance(db, merged);
  revalidatePath(`/painel/batches/${batchId}`, 'layout');
  if (!moved) redirect(`/painel/batches/${batchId}/revisar?semMotivo=1`);
}

export async function bulkAction(form: FormData) {
  const db = await authedDb();
  const batchId = String(form.get('batchId'));
  const action = String(form.get('bulk'));
  const leads = (await Promise.all(form.getAll('selected').map((id) => getLead(db, String(id))))).filter((l): l is Lead => !!l);
  let skipped = 0;
  for (const lead of leads) {
    if (action === 'descartar') await moveLead(db, lead, 'descartado', { exit_reason: 'Descartado por você' });
    else if (!(await advance(db, lead))) skipped += 1;
  }
  revalidatePath(`/painel/batches/${batchId}`, 'layout');
  if (skipped) redirect(`/painel/batches/${batchId}/revisar?semMotivo=${skipped}`);
}
