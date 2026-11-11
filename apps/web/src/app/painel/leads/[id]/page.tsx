import { clientsByLead, getBatch, getContactByLead, getLead, getSite, listBatchStages, listEvents, getVideo } from '@lps/db';
import { availableActions, describeEvent, PROCESS_STEPS, stepOf, summarizeBatch } from '@lps/domain';
import { ArrowLeft, Check, ExternalLink, EyeOff, MessageCircle, Play, X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { NoteField } from '@/components/leads/note-field';
import { Stepper } from '@/components/process/stepper';
import { Badge, Button, Card, LinkButton, Status } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { batchLabel } from '@/lib/batch-context';
import { STATUS_LABEL } from '@/lib/crm';
import { flowLabel, formatDateTime, leadMeta, siteLabel } from '@/lib/lead-labels';
import { removeModelAction } from './actions';

const Datum = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{children}</dd></div>
);
const STAGES_WITH_REASON = ['revisar', 'completar', 'gerando_material', 'revisar_material', 'crm'];

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await authedDb();
  const lead = await getLead(db, id);
  if (!lead) notFound();
  const [batch, stages, site, video, events, clients, contact] = await Promise.all([
    lead.batch_id ? getBatch(db, lead.batch_id) : null,
    listBatchStages(db),
    getSite(db, id),
    getVideo(db, id),
    listEvents(db, id),
    clientsByLead(db, [id]),
    getContactByLead(db, id),
  ]);
  const step = stepOf(lead.stage);
  const stepName = PROCESS_STEPS.find((s) => s.key === step)?.label;
  const actions = availableActions(lead);
  const clientId = clients.get(id);
  const flow = flowLabel(lead);
  const site_ = siteLabel(lead);
  const summary = summarizeBatch(stages.filter((s) => s.batch_id === lead.batch_id));
  const crmHref = contact ? `/painel/crm?contato=${contact.id}` : null;
  const contactStatus = contact ? STATUS_LABEL[contact.status] : null;
  const backHref = batch && step ? `/painel/batches/${batch.id}/${step}` : crmHref ?? (batch ? `/painel/batches/${batch.id}/revisar` : '/painel/batches');

  return (
    <>
      <Topbar crumbs={[{ label: 'Batches', href: '/painel/batches' }, ...(batch ? [{ label: batchLabel(batch), href: `/painel/batches/${batch.id}/revisar` }] : []), { label: lead.name }]} />
      {batch && step && <Stepper batchId={batch.id} counts={summary.counts} current={step ?? undefined} />}
      <main className="space-y-4 p-4 lg:p-6">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar{stepName ? ` para ${stepName}` : !step && crmHref ? ' para o CRM' : ''}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {stepName ? <Badge>Etapa: {stepName}</Badge> : contactStatus ? <Status tone={contactStatus.tone}>CRM: {contactStatus.label}</Status> : <Badge>{lead.stage.replace(/_/g, ' ')}</Badge>}
              {lead.flow && <Status tone={flow.tone}>Fluxo: {flow.label}</Status>}
              {leadMeta(lead)}
            </div>
            {lead.exit_reason && <p className="mt-2 text-sm text-warning">{lead.exit_reason}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {actions.includes('descartar') && actions.includes('nao_contatar') && <ExitButtons leadId={id} />}
            {!actions.includes('descartar') && actions.includes('nao_contatar') && <ExitButtons leadId={id} className="flex [&>form:first-child]:hidden" />}
            {crmHref && <LinkButton href={crmHref} variant="outline"><MessageCircle />Abrir no CRM</LinkButton>}
            {site?.status === 'modelo' && (
              <form action={removeModelAction}>
                <input type="hidden" name="leadId" value={id} />
                <Button type="submit" variant="ghost"><EyeOff />Remover modelo</Button>
              </form>
            )}
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
                <p className="text-3xl font-semibold">{lead.score ?? '—'}<span className="ml-1 text-sm font-normal text-muted-foreground">/100</span></p>
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
                <NoteField leadId={id} field="reason" initial={lead.reason} label="Motivo · vai na mensagem e no vídeo" placeholder="ex.: não funciona bem no celular" />
              )}
              <NoteField leadId={id} field="comment" initial={lead.comment} label="Comentário interno" placeholder="Não vai para o lead" />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-medium">Material</h2>
              {!site && <p className="text-sm text-muted-foreground">Ainda não gerado.</p>}
              {site && (
                <div className="flex flex-wrap gap-2">
                  {site.status === 'removido'
                    ? <Badge tone="danger">Modelo removido</Badge>
                    : <LinkButton href={`/p/${site.slug}`} variant="outline" external><ExternalLink />Página de exemplo</LinkButton>}
                  {site.content.videoUrl && <LinkButton href={site.content.videoUrl} variant="outline" external><Play />Vídeo{video?.duration_seconds ? ` · ${Math.round(Number(video.duration_seconds))} s` : ''}</LinkButton>}
                </div>
              )}
            </Card>
          </div>
          <Card className="h-fit p-5">
            <h2 className="mb-3 font-medium">Histórico</h2>
            <ol className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 text-sm">
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
