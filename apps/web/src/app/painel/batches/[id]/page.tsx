import { listContactsOfLeads, listLeads, OTHER_LEAD_CONTACT, STALE, type Db } from '@lps/db';
import {
  applyReviewFilter, columnOf, countByOption, parseReviewFilter, phoneMatchCandidates, serializeReviewFilter,
  type Contact, type Lead, type LeadAsset, type PipelineColumn,
} from '@lps/domain';
import { ExternalLink, Loader2, Phone, Star } from 'lucide-react';
import { ActiveFilters, ReviewFilters } from '@/components/batches/review-filters';
import { LeadDrawer } from '@/components/leads/lead-drawer';
import { Board } from '@/components/pipeline/board';
import { CompleteModal } from '@/components/pipeline/complete-modal';
import { LinkModal } from '@/components/pipeline/link-modal';
import { LeadChatsModal } from '@/components/pipeline/lead-chats-modal';
import { Topbar } from '@/components/layout/topbar';
import { Card } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { batchLabel, loadBatchContext } from '@/lib/batch-context';
import { boardHref } from '@/lib/board-href';
import { leadMeta } from '@/lib/lead-labels';

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);
/** Avisos que voltam pela URL depois que o modal fecha. Só textos conhecidos aparecem. */
const NOTICES = [OTHER_LEAD_CONTACT, STALE];
const WORKER_STALE_MS = 2 * 60_000;

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
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
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

/** Itens dos leads em Qualificado, numa consulta só. */
async function assetsByLead(db: Db, leadIds: string[]): Promise<Record<string, LeadAsset[]>> {
  if (!leadIds.length) return {};
  const { data, error } = await db.from('lead_assets').select().in('lead_id', leadIds).order('created_at');
  if (error) throw new Error(error.message);
  const out: Record<string, LeadAsset[]> = {};
  for (const a of data as LeadAsset[]) (out[a.lead_id] ??= []).push(a);
  return out;
}

/**
 * Conversas de cada lead em Pronto para abordar: todos os contatos ligados por `contacts.lead_id`
 * (um lead pode ter vários números). Quem não tem nenhum (o telefone já era contato de outro lead)
 * é achado pelo telefone.
 */
async function contactsByLead(db: Db, leads: Lead[]): Promise<Record<string, Contact[]>> {
  if (!leads.length) return {};
  const out = await listContactsOfLeads(db, leads.map((l) => l.id));

  const missing = leads.filter((l) => !out[l.id] && l.phone_e164);
  if (missing.length) {
    const candidates = missing.map((l) => ({ lead: l, phones: phoneMatchCandidates(l.phone_e164!) }));
    const { data: byPhone, error: phoneError } = await db.from('contacts').select().in('phone_e164', candidates.flatMap((c) => c.phones));
    if (phoneError) throw new Error(phoneError.message);
    for (const { lead, phones } of candidates) {
      const c = (byPhone as Contact[]).find((row) => phones.includes(row.phone_e164));
      if (c) out[lead.id] = [c];
    }
  }
  return out;
}

/** Links temporários (1 h) das imagens extraídas do material, para o briefing. Os caminhos são do bucket privado. */
async function materialLinksOf(db: Db, assets: LeadAsset[]): Promise<Record<string, string>> {
  const paths = [...new Set(assets.filter((a) => a.status === 'pronto').flatMap((a) => a.extracted_images ?? []))];
  if (!paths.length) return {};
  const { data } = await db.storage.from('lead-assets').createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
}

/** Há tarefa de extração pendente há mais de 2 minutos? Sinal de worker parado. */
async function workerLooksStale(db: Db): Promise<boolean> {
  const { data } = await db.from('jobs').select('id').eq('type', 'extract_asset').eq('status', 'pendente')
    .lte('run_after', new Date(Date.now() - WORKER_STALE_MS).toISOString()).limit(1);
  return (data?.length ?? 0) > 0;
}

export default async function PipelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const filter = parseReviewFilter(query);
  const { db, batch } = await loadBatchContext(id);
  const running = batch.status === 'buscando' || batch.status === 'analisando';

  const all = await listLeads(db, id, undefined, 'stage_changed_at');
  const now = new Date();
  const toReview = all.filter((l) => l.stage === 'revisar');
  const analyzing = all.filter((l) => l.stage === 'analisando');
  const reviewed = applyReviewFilter(toReview, filter, now);
  const rest = all.filter((l) => columnOf(l.stage) !== 'novo');
  const leads = [...analyzing, ...reviewed, ...rest];

  const qualified = rest.filter((l) => l.stage === 'completar');
  const ready = rest.filter((l) => columnOf(l.stage) === 'pronto');
  const [assets, contacts] = await Promise.all([assetsByLead(db, qualified.map((l) => l.id)), contactsByLead(db, ready)]);

  const filterQs = serializeReviewFilter(filter);
  const href = (leadId: string | null) => boardHref(id, filterQs, leadId);
  const closeHref = href(null);

  // Lead aberto em `?lead=`: o modal depende da coluna em que ele está.
  const open = query.lead ? all.find((l) => l.id === query.lead) : undefined;
  const openColumn: PipelineColumn | null = open ? columnOf(open.stage) : null;
  const siblings = (list: Lead[]) => {
    const i = open ? list.findIndex((l) => l.id === open.id) : -1;
    return { position: `${i + 1} de ${list.length}`, prevHref: i > 0 ? href(list[i - 1].id) : null, nextHref: i >= 0 && i < list.length - 1 ? href(list[i + 1].id) : null };
  };
  // Lead de um link compartilhado que não está (mais) neste batch. Os outros casos chegam por `aviso`.
  const notice = query.aviso && NOTICES.includes(query.aviso) ? query.aviso : query.lead && !open ? STALE : null;

  let modal: React.ReactNode = null;
  if (open && (open.stage === 'revisar' || openColumn === 'descartados')) {
    const list = open.stage === 'revisar' ? reviewed : rest.filter((l) => columnOf(l.stage) === 'descartados');
    modal = <LeadDrawer key={open.id} lead={open} closeHref={closeHref} {...siblings(list)} />;
  } else if (open?.stage === 'completar') {
    const stale = (assets[open.id] ?? []).some((a) => a.status === 'extraindo') && (await workerLooksStale(db));
    const materialLinks = await materialLinksOf(db, assets[open.id] ?? []);
    modal = <CompleteModal key={open.id} lead={open} assets={assets[open.id] ?? []} materialLinks={materialLinks} closeHref={closeHref} workerStale={stale} {...siblings(qualified)} />;
  } else if (open && (open.stage === 'pagina' || open.stage === 'video')) {
    modal = <LinkModal key={`${open.id}-${open.stage}`} kind={open.stage} lead={open} closeHref={closeHref} />;
   } else if (open && openColumn === 'pronto') {
    modal = <LeadChatsModal key={open.id} lead={open} contacts={contacts[open.id] ?? []} closeHref={closeHref} now={now.toISOString()} />;
  }

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Batches', href: '/painel/batches' }, { label: batchLabel(batch) }]}
        actions={toReview.length > 0 && <ReviewFilters batchId={id} filter={filter} counts={countByOption(toReview, now)} shown={reviewed.length} total={toReview.length} />}
      />
      {/* No desktop o quadro ocupa o resto da tela e cada coluna rola por dentro. */}
      <main className="p-4 md:flex md:h-[calc(100dvh-4.5rem)] md:flex-col lg:p-6">
        {running && <AutoRefresh />}
        {running && <Arriving leads={analyzing} searching={batch.status === 'buscando'} quantity={batch.quantity} />}
        <ActiveFilters batchId={id} filter={filter} shown={reviewed.length} total={toReview.length} />
        {notice && <p role="status" className="mb-4 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">{notice}</p>}
        <Board batchId={id} leads={leads} assets={assets} contacts={contacts} query={filterQs} openId={open?.id} />
        {modal}
        <div className="h-20 md:hidden" />
      </main>
    </>
  );
}
