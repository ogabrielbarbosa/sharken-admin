import { createAdminClient, logEvent } from '@lps/db';
import { shouldRecordOpen, type LeadStage } from '@lps/domain';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown };
  if (typeof body.slug !== 'string') return new Response(null, { status: 204 });

  const db = createAdminClient();
  const { data } = await db.from('sites').select('lead_id, leads(stage)').eq('slug', body.slug).maybeSingle();
  if (!data) return new Response(null, { status: 204 });

  const auth = await (await createServerClient()).auth.getUser();
  const stage = (data.leads as unknown as { stage: LeadStage }).stage;
  if (shouldRecordOpen({ stage, isAdmin: !!auth.data.user, isCapture: false })) {
    await logEvent(db, data.lead_id as string, 'abertura');
  }
  return new Response(null, { status: 204 });
}
