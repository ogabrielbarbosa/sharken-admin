import { listLeads } from '@lps/db';
import { applyReviewFilter, countByOption, parseReviewFilter, serializeReviewFilter, type Lead } from '@lps/domain';
import { ExternalLink, Inbox, Loader2, Phone, Plus, Star } from 'lucide-react';
import { LeadDrawer } from '@/components/leads/lead-drawer';
import { LeadTable } from '@/components/leads/lead-table';
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { ActiveFilters, ReviewFilters } from '@/components/batches/review-filters';
import { loadBatchContext } from '@/lib/batch-context';
import { leadMeta } from '@/lib/lead-labels';

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);

/** Negócios que já chegaram do Google Maps e ainda não foram analisados. */
function Arriving({ leads, searching, quantity }: { leads: Lead[]; searching: boolean; quantity: number }) {
  const title = searching ? `Buscando no Google Maps · ${leads.length} de ${quantity} encontrados` : `Analisando · ${leads.length} na fila`;
  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        {title}
      </div>
      {leads.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Os negócios aparecem aqui conforme o Apify encontra.</p>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => {
            const link = lead.website_url ?? lead.instagram_url;
            return (
              <li key={lead.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm lg:flex-row lg:items-center lg:gap-4">
                <span className="min-w-0 font-medium lg:w-64 lg:truncate">{lead.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{lead.address ?? leadMeta(lead)}</span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {lead.rating != null && <span className="inline-flex items-center gap-1"><Star className="size-3" />{lead.rating} ({lead.reviews_count})</span>}
                  {lead.phone_raw && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{lead.phone_raw}</span>}
                  {link
                    ? <a href={fullUrl(link)} target="_blank" rel="noreferrer" className="inline-flex max-w-56 items-center gap-1 truncate hover:text-foreground">{shortUrl(link)}<ExternalLink className="size-3 shrink-0" /></a>
                    : <span>Sem site</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default async function RevisarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const filter = parseReviewFilter(query);
  const { db, batch } = await loadBatchContext(id);
  const running = batch.status === 'buscando' || batch.status === 'analisando';
  const [allLeads, arriving] = await Promise.all([listLeads(db, id, ['revisar']), running ? listLeads(db, id, ['analisando']) : []]);
  const now = new Date();
  const leads = applyReviewFilter(allLeads, filter, now);
  const progress = running && (
    <>
      <AutoRefresh />
      <Arriving leads={arriving} searching={batch.status === 'buscando'} quantity={batch.quantity} />
    </>
  );

  if (!allLeads.length) {
    const analyzing = running;
    return (
      <>
        {progress}
        <PageHeader title="Leads" description="Nenhum lead aguardando revisão." />
        <EmptyState
          icon={<Inbox />}
          title="Nenhum lead para revisar"
          description={analyzing ? 'A busca está em andamento. Os leads aparecem aqui quando a análise terminar.' : 'Quando este batch terminar a análise, os leads aparecem aqui para você avançar ou descartar.'}
          actions={<><LinkButton href="/painel/batches" variant="outline">Ver batches</LinkButton><LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton></>}
        />
      </>
    );
  }

  const hrefFor = (leadId: string | null) => {
    const qs = new URLSearchParams(serializeReviewFilter(filter));
    if (leadId) qs.set('lead', leadId);
    const text = qs.toString();
    return `/painel/batches/${id}/revisar${text ? `?${text}` : ''}`;
  };
  const openIndex = leads.findIndex((l) => l.id === query.lead);
  const open = openIndex >= 0 ? leads[openIndex] : null;

  return (
    <>
      {progress}
      <PageHeader
        title="Leads"
        description={`${allLeads.length} ${allLeads.length === 1 ? 'lead analisado' : 'leads analisados'}. Abra o nome para ver a análise completa.`}
        actions={<ReviewFilters batchId={id} filter={filter} counts={countByOption(allLeads, now)} shown={leads.length} total={allLeads.length} />}
      />
      <ActiveFilters batchId={id} filter={filter} shown={leads.length} total={allLeads.length} />
      {leads.length === 0
        ? <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum lead bate com esse filtro.</p>
        : <LeadTable leads={leads} batchId={id} openId={open?.id} hrefFor={hrefFor} />}
      {open && (
        <LeadDrawer
          lead={open}
          position={`${openIndex + 1} de ${leads.length}`}
          batchId={id}
          prevHref={openIndex > 0 ? hrefFor(leads[openIndex - 1].id) : null}
          nextHref={openIndex < leads.length - 1 ? hrefFor(leads[openIndex + 1].id) : null}
          closeHref={hrefFor(null)}
        />
      )}
      <div className="h-20" />
    </>
  );
}
