import { secretMatches } from '@lps/config';
import { createAdminClient, fetchAll } from '@lps/db';
import { shouldDeleteLead, type Lead } from '@lps/domain';

const ASSETS_BUCKET = 'lead-assets';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!secretMatches(token, process.env.CRON_SECRET)) return Response.json({ error: 'não autorizado' }, { status: 401 });

  const db = createAdminClient();
  const now = new Date();

  type Row = Pick<Lead, 'id' | 'stage' | 'created_at' | 'contacted_at' | 'follow_up_at' | 'responded_at'> & { clients: { id: string }[] | { id: string } | null };
  const leads = await fetchAll<Row>((from, to) =>
    db.from('leads').select('id, stage, created_at, contacted_at, follow_up_at, responded_at, clients(id)').order('id').range(from, to) as never,
  );
  const hasClient = (r: Row) => (Array.isArray(r.clients) ? r.clients.length > 0 : !!r.clients);
  const expired = leads.filter((l) => shouldDeleteLead({ ...l, hasClient: hasClient(l) }, now));
  for (const lead of expired) {
    const { data: assets } = await db.from('lead_assets').select('storage_path').eq('lead_id', lead.id).not('storage_path', 'is', null);
    const paths = (assets ?? []).map((a) => a.storage_path as string);
    if (paths.length) await db.storage.from(ASSETS_BUCKET).remove(paths);
    // Arquivos, eventos e o restante saem junto. A lista de não contatar é outra tabela e permanece.
    await db.from('leads').delete().eq('id', lead.id);
  }
  return Response.json({ removedLeads: expired.length });
}
