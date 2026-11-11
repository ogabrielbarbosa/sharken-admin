import { listLeads } from '@lps/db';
import { applyReviewFilter, countByOption, isFiltering, parseReviewFilter, type Lead, type ScoreReason } from '@lps/domain';
import { ArrowRight, Check, ExternalLink, Inbox, Loader2, Phone, Plus, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { NoteField } from '@/components/leads/note-field';
import { Badge, Button, Card, EmptyState, ErrorNote, Input, LinkButton, Status, Toolbar } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { ActiveFilters, ReviewFilters } from '@/components/batches/review-filters';
import { loadBatchContext } from '@/lib/batch-context';
import { siteLabel, leadMeta } from '@/lib/lead-labels';
import { advanceLeadAction, bulkAction } from './actions';

function scoreTone(score: number) {
  if (score >= 70) return 'bg-success';
  if (score >= 50) return 'bg-warning';
  return 'bg-destructive';
}

function Criteria({ reasons }: { reasons: ScoreReason[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((r) => (
        <Badge key={r.label} tone={r.met ? 'success' : 'danger'}>{r.met ? <Check /> : <X />}{r.label}</Badge>
      ))}
    </div>
  );
}

function LeadCard({ lead, batchId }: { lead: Lead; batchId: string }) {
  const site = siteLabel(lead);
  const score = lead.score ?? 0;
  const formId = `advance-${lead.id}`;
  return (
    <Card interactive className="flex flex-col gap-4 p-4 lg:flex-row lg:p-5">
      <input type="checkbox" name="selected" value={lead.id} form="bulk" aria-label={`Selecionar ${lead.name}`} className="mt-1 size-4 shrink-0 accent-blue-500" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <Link href={`/painel/leads/${lead.id}`} className="font-medium transition-colors hover:text-brand-light">{lead.name}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{leadMeta(lead)}</span>
            <span className="text-foreground"><Status tone={site.tone}>{site.label}</Status></span>
            {lead.website_url && (
              <a href={/^https?:/i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                {lead.website_url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}<ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        {lead.score_reasons && <Criteria reasons={lead.score_reasons} />}
        {lead.site_signals && (
          <div className="flex flex-wrap gap-1.5">
            {lead.site_signals.map((s) => <Badge key={s.key} tone={s.ok ? 'neutral' : 'warning'}>{s.label}</Badge>)}
          </div>
        )}
        {lead.summary && <p className="text-sm leading-relaxed text-muted-foreground">{lead.summary}</p>}
        {lead.error && <p className="text-xs text-warning">{lead.error}</p>}
        {lead.flow === 'melhorar_site' && (
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">Motivo · vai na mensagem e no vídeo</span>
            <Input name="reason" form={formId} defaultValue={lead.reason ?? ''} placeholder="ex.: não funciona bem no celular" />
          </label>
        )}
        <NoteField leadId={lead.id} field="comment" initial={lead.comment} placeholder="Comentário interno (não vai para o lead)…" />
      </div>
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-60">
        <div className="lg:text-right">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Pontuação</p>
          <p className="text-2xl font-semibold tabular-nums">{score}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span></p>
          <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full origin-left animate-grow-x rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
          </div>
        </div>
        <form id={formId} action={advanceLeadAction}>
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" className="w-full"><ArrowRight />Avançar</Button>
        </form>
        <ExitButtons leadId={lead.id} className="flex justify-between" />
      </div>
    </Card>
  );
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);

/** Negócios que já chegaram do Google Maps e ainda não foram analisados. */
function Arriving({ leads, searching, quantity }: { leads: Lead[]; searching: boolean; quantity: number }) {
  const title = searching ? `Buscando no Google Maps · ${leads.length} de ${quantity} encontrados` : `Analisando · ${leads.length} na fila`;
  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
        <Loader2 className="size-4 animate-spin text-brand-soft" />
        {title}
      </div>
      {leads.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Os negócios aparecem aqui conforme o Apify encontra.</p>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => {
            const link = lead.website_url ?? lead.instagram_url;
            return (
              <li key={lead.id} className="flex animate-rise flex-col gap-1 px-4 py-2.5 text-sm lg:flex-row lg:items-center lg:gap-4">
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
  const { semMotivo } = query;
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
        <EmptyState
          icon={<Inbox />}
          title="Nenhum lead para revisar"
          description={analyzing ? 'A busca está em andamento. Os leads aparecem aqui quando a análise terminar.' : 'Quando este batch terminar a análise, os leads aparecem aqui para você avançar ou descartar.'}
          actions={<><LinkButton href="/painel/batches" variant="outline">Ver batches</LinkButton><LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton></>}
        />
      </>
    );
  }

  return (
    <>
      {progress}
      <Toolbar start={<span className="text-sm text-muted-foreground"><b className="font-medium text-foreground tabular-nums">{allLeads.length}</b> {allLeads.length === 1 ? 'lead para revisar' : 'leads para revisar'}</span>}>
        <ReviewFilters batchId={id} filter={filter} counts={countByOption(allLeads, now)} shown={leads.length} total={allLeads.length} />
      </Toolbar>
      <ActiveFilters batchId={id} filter={filter} shown={leads.length} total={allLeads.length} />
      {semMotivo && <div className="mb-4"><ErrorNote>Leads com site funcionando precisam de um motivo para avançar.</ErrorNote></div>}
      <form id="bulk" action={bulkAction} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <input type="hidden" name="batchId" value={id} />
        <p className="text-sm text-muted-foreground">Selecione leads para agir em lote{isFiltering(filter) ? ' · só os que aparecem no filtro' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="bulk" value="descartar" variant="outline"><Trash2 />Descartar selecionados</Button>
          <Button type="submit" name="bulk" value="avancar"><ArrowRight />Avançar selecionados</Button>
        </div>
      </form>
      {leads.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum lead bate com esse filtro.</p>}
      <div className="stagger space-y-4">{leads.map((lead) => <LeadCard key={lead.id} lead={lead} batchId={id} />)}</div>
    </>
  );
}
