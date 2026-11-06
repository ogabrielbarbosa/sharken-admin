import { listLeads } from '@lps/db';
import type { Lead, ScoreReason } from '@lps/domain';
import { ArrowRight, Check, ExternalLink, Inbox, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { NoteField } from '@/components/leads/note-field';
import { Badge, Button, Card, EmptyState, ErrorNote, Input, LinkButton, PageHeader, Status } from '@/components/ui';
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
    <Card className="flex flex-col gap-4 p-4 lg:flex-row lg:p-5">
      <input type="checkbox" name="selected" value={lead.id} form="bulk" aria-label={`Selecionar ${lead.name}`} className="mt-1 size-4 shrink-0 accent-neutral-200" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
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
          <p className="text-2xl font-semibold">{score}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span></p>
          <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
            <div className={`h-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
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

export default async function RevisarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semMotivo?: string }> }) {
  const { id } = await params;
  const { semMotivo } = await searchParams;
  const { db, batch } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['revisar']);

  if (!leads.length) {
    const analyzing = batch.status === 'buscando' || batch.status === 'analisando';
    return (
      <>
        <PageHeader title="Revisar" description="Nenhum lead aguardando revisão." />
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
      <PageHeader title="Revisar" description={`${leads.length} ${leads.length === 1 ? 'lead analisado aguardando' : 'leads analisados aguardando'} sua revisão. Avance os bons e descarte o resto.`} />
      {semMotivo && <div className="mb-4"><ErrorNote>Leads com site funcionando precisam de um motivo para avançar.</ErrorNote></div>}
      <form id="bulk" action={bulkAction} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <input type="hidden" name="batchId" value={id} />
        <p className="text-sm text-muted-foreground">Selecione leads para agir em lote · ordenados por maior pontuação</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="bulk" value="descartar" variant="outline"><Trash2 />Descartar selecionados</Button>
          <Button type="submit" name="bulk" value="avancar"><ArrowRight />Avançar selecionados</Button>
        </div>
      </form>
      <div className="space-y-4">{leads.map((lead) => <LeadCard key={lead.id} lead={lead} batchId={id} />)}</div>
    </>
  );
}
