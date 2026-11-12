import { clientsByLead, getBatch, getContactByLead, getLead, listEvents } from '@lps/db';
import { availableActions, describeEvent } from '@lps/domain';
import { ArrowLeft, Check, ExternalLink, LayoutDashboard, MessageCircle, Play, X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { NoteField } from '@/components/leads/note-field';
import { Badge, Card, LinkButton, Status } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { batchLabel } from '@/lib/batch-context';
import { STATUS_LABEL } from '@/lib/crm';
import { flowLabel, formatDateTime, leadMeta, siteLabel } from '@/lib/lead-labels';

const Datum = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{children}</dd></div>
);
const STAGES_WITH_REASON = ['revisar', 'completar', 'pagina', 'video', 'crm'];

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await authedDb();
  const lead = await getLead(db, id);
  if (!lead) notFound();
  const [batch, events, clients, contact] = await Promise.all([
    lead.batch_id ? getBatch(db, lead.batch_id) : null,
    listEvents(db, id),
    clientsByLead(db, [id]),
    getContactByLead(db, id),
  ]);
  const actions = availableActions(lead);
  const clientId = clients.get(id);
  const flow = flowLabel(lead);
  const site_ = siteLabel(lead);
  const crmHref = contact ? `/painel/crm?contato=${contact.id}` : null;
  const contactStatus = contact ? STATUS_LABEL[contact.status] : null;
  const boardHref = batch ? `/painel/batches/${batch.id}?lead=${id}` : null;
  const backHref = boardHref ?? crmHref ?? '/painel/batches';

  return (
    <>
      <Topbar crumbs={[{ label: 'Batches', href: '/painel/batches' }, ...(batch ? [{ label: batchLabel(batch), href: `/painel/batches/${batch.id}` }] : []), { label: lead.name }]} />
      <main className="stagger space-y-4 p-4 lg:p-6">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar{boardHref ? ' para o quadro' : crmHref ? ' para o CRM' : ''}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {contactStatus ? <Status tone={contactStatus.tone}>CRM: {contactStatus.label}</Status> : <Badge>{lead.stage.replace(/_/g, ' ')}</Badge>}
              {lead.flow && <Status tone={flow.tone}>Fluxo: {flow.label}</Status>}
              {leadMeta(lead)}
            </div>
            {lead.exit_reason && <p className="mt-2 text-sm text-warning">{lead.exit_reason}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {actions.includes('descartar') && actions.includes('nao_contatar') && <ExitButtons leadId={id} />}
            {!actions.includes('descartar') && actions.includes('nao_contatar') && <ExitButtons leadId={id} className="flex [&>form:first-child]:hidden" />}
            {boardHref && <LinkButton href={boardHref} variant="outline"><LayoutDashboard />Abrir no quadro</LinkButton>}
            {crmHref && <LinkButton href={crmHref} variant="outline"><MessageCircle />Abrir no CRM</LinkButton>}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-2 font-medium">Dados do negócio</h2>
                <dl className="divide-y divide-border">
                  <Datum label="Telefone">{lead.phone_raw ?? '—'}</Datum>
                  <Datum label="Endereço">{lead.address ?? '—'}</Datum>
                  <Datum label="Nota">{lead.rating !== null ? `${String(lead.rating).replace('.', ',')} de 5` : '—'}</Datum>
                  <Datum label="Avaliações">{lead.reviews_count} no Google</Datum>
                  <Datum label="Site">
                    {lead.website_url
                      ? <a href={lead.website_url} target="_blank" rel="noreferrer" className="underline">{site_.label}</a>
                      : site_.label}
                  </Datum>
                  <Datum label="Instagram">{lead.instagram_url ? <a href={lead.instagram_url} target="_blank" rel="noreferrer" className="underline">Abrir perfil</a> : '—'}</Datum>
                  {crmHref && <Datum label="Contato"><Link href={crmHref} className="underline">Ver no CRM</Link></Datum>}
                  {clientId && <Datum label="Cliente"><Link href={`/painel/clientes/${clientId}`} className="underline">Ver cliente</Link></Datum>}
                </dl>
              </Card>
              <Card className="p-5">
                <h2 className="mb-2 font-medium">Análise e pontuação</h2>
                <p className="text-3xl font-semibold text-foreground tabular-nums">{lead.score ?? '—'}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span></p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {lead.score_reasons?.map((r) => (
                    <li key={r.label} className="flex items-center gap-2">
                      {r.met ? <Check className="size-4 text-success-foreground" /> : <X className="size-4 text-destructive" />}{r.label}
                    </li>
                  ))}
                </ul>
                {lead.site_signals && <div className="mt-3 flex flex-wrap gap-1.5">{lead.site_signals.map((s) => <Badge key={s.key} tone={s.ok ? 'neutral' : 'warning'}>{s.label}</Badge>)}</div>}
                {lead.summary && <p className="mt-3 text-sm text-muted-foreground">{lead.summary}</p>}
              </Card>
            </div>
            <Card className="space-y-3 p-5">
              {lead.flow === 'melhorar_site' && STAGES_WITH_REASON.includes(lead.stage) && (
                <NoteField leadId={id} field="reason" initial={lead.reason} label="Motivo · vai na mensagem" placeholder="ex.: não funciona bem no celular" />
              )}
              <NoteField leadId={id} field="comment" initial={lead.comment} label="Comentário interno" placeholder="Não vai para o lead" />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-medium">Links</h2>
              {!lead.page_url && !lead.loom_url && <p className="text-sm text-muted-foreground">Nenhum link anexado.{boardHref && <> Anexe no <Link href={boardHref} className="underline">quadro do batch</Link>.</>}</p>}
              <div className="flex flex-wrap gap-2">
                {lead.page_url && <LinkButton href={lead.page_url} variant="outline" external><ExternalLink />Abrir link da página</LinkButton>}
                {lead.loom_url && <LinkButton href={lead.loom_url} variant="outline" external><Play />Abrir link do Loom</LinkButton>}
              </div>
            </Card>
          </div>
          <Card className="h-fit p-5">
            <h2 className="mb-3 font-medium">Histórico</h2>
            <ol className="relative space-y-3 before:absolute before:inset-y-1 before:left-[3px] before:w-px before:bg-brand/40">
              {events.map((e, i) => (
                <li key={e.id} className="relative flex justify-between gap-3 pl-5 text-sm">
                  <span aria-hidden className={`absolute top-1.5 left-0 size-[7px] rounded-full ${i === 0 ? 'bg-brand-bright shadow-[0_0_8px_#1f88c0]' : 'bg-zinc-600'}`} />
                  <span>{describeEvent(e)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-muted-foreground">Sem eventos ainda.</li>}
            </ol>
          </Card>
        </div>
      </main>
    </>
  );
}
