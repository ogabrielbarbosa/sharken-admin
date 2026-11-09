import { secretMatches } from '@lps/config';
import { createAdminClient, fetchAll, type SiteRecord } from '@lps/db';
import { shouldDeleteLead, shouldRemoveSite, type Lead } from '@lps/domain';
import { removeMedia } from '@lps/integrations';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!secretMatches(token, process.env.CRON_SECRET)) return Response.json({ error: 'não autorizado' }, { status: 401 });

  const db = createAdminClient();
  const now = new Date();
  const sites = await fetchAll<SiteRecord>((from, to) => db.from('sites').select('id, lead_id, slug, status, expires_at').order('id').range(from, to) as never);
  const slugByLead = new Map(sites.map((s) => [s.lead_id, s.slug]));

  let removedSites = 0;
  for (const site of sites.filter((s) => shouldRemoveSite(s, now))) {
    await removeMedia(db, `sites/${site.slug}`);
    await db.from('sites').update({ status: 'removido' }).eq('id', site.id);
    removedSites += 1;
  }

  type Row = Pick<Lead, 'id' | 'stage' | 'created_at' | 'contacted_at' | 'follow_up_at' | 'responded_at'> & { clients: { id: string }[] | { id: string } | null };
  const leads = await fetchAll<Row>((from, to) =>
    db.from('leads').select('id, stage, created_at, contacted_at, follow_up_at, responded_at, clients(id)').order('id').range(from, to) as never,
  );
  const hasClient = (r: Row) => (Array.isArray(r.clients) ? r.clients.length > 0 : !!r.clients);
  const expired = leads.filter((l) => shouldDeleteLead({ ...l, hasClient: hasClient(l) }, now));
  for (const lead of expired) {
    const slug = slugByLead.get(lead.id);
    if (slug) await removeMedia(db, `sites/${slug}`);
    // Sites, vídeos e eventos saem junto. A lista de não contatar é outra tabela e permanece.
    await db.from('leads').delete().eq('id', lead.id);
  }
  return Response.json({ removedSites, removedLeads: expired.length });
}
