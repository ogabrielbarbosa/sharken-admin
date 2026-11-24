import { clientsByLead, getBatch, getContactByLead, getLead, INSTAGRAM_MEDIA_JOB, lastLeadJob, listEvents } from '@lps/db';
import { availableActions, columnOf, describeEvent, formatPhone, instagramHandle, PIPELINE_COLUMNS } from '@lps/domain';
import { workspaceHasApify } from '@lps/integrations';
import { AtSign, Briefcase, Building2, Check, FolderSearch, Globe, LayoutDashboard, Mail, MapPin, MessageCircle, Phone, Smartphone, Star, X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/crm/avatar';
import { Value } from '@/components/crm/panel-parts';
import { Topbar } from '@/components/layout/topbar';
import { EnrichmentInfo } from '@/components/leads/enrichment-info';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { InstagramCard } from '@/components/leads/instagram-card';
import { NoteField } from '@/components/leads/note-field';
import { siteUrl } from '@/components/leads/lead-links';
import { QuickLinks } from '@/components/leads/quick-links';
import { Badge, Card, LinkButton } from '@/components/ui';
import { authedDb, getSession } from '@/lib/auth';
import { batchLabel } from '@/lib/batch-context';
import { STATUS_LABEL } from '@/lib/crm';
import { flowLabel, formatDateTime, instagramLabel, siteLabel } from '@/lib/lead-labels';

const STAGES_WITH_REASON = ['revisar', 'completar', 'pagina', 'video', 'crm'];
const phoneText = (e164: string) => (e164.startsWith('55') ? formatPhone(e164) : `+${e164}`);

function Datum({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm">
      <dt className="flex min-h-6 w-24 shrink-0 items-center gap-2 text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">{icon}{label}</dt>
      <dd className="flex min-h-6 min-w-0 flex-1 items-center [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string | null }) {
  return (
    <Card className="min-w-0 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

/** Ficha do lead: identificação e atalhos no topo, análise e imagens à esquerda, dados e histórico à direita. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await authedDb();
  const lead = await getLead(db, id);
  if (!lead) notFound();
  const { workspace } = await getSession();
  const [batch, events, clients, contact, job, apify] = await Promise.all([
    lead.batch_id ? getBatch(db, lead.batch_id) : null,
    listEvents(db, id),
    clientsByLead(db, [id]),
    getContactByLead(db, id),
    lastLeadJob(db, INSTAGRAM_MEDIA_JOB, id),
    workspaceHasApify(workspace.id),
  ]);
  const actions = availableActions(lead);
  const clientId = clients.get(id);
  const flow = flowLabel(lead);
  const site = siteLabel(lead);
  const siteHref = siteUrl(lead);
  const handle = instagramHandle(lead.instagram_url);
  const ig = instagramLabel(lead, lead.score_reasons?.find((r) => r.label.startsWith('Instagram'))?.met);
  const crmHref = contact ? `/painel/crm?contato=${contact.id}` : null;
  const boardHref = batch ? `/painel/batches/${batch.id}?lead=${id}` : null;
  const media = lead.instagram_media ?? [];
  const profilePic = media.find((m) => m.kind === 'perfil')?.url ?? null;
  const mobile = lead.phone_e164 ? phoneText(lead.phone_e164) : null;
  // O telefone do cadastro só aparece quando é outro número.
  const landline = lead.phone_raw && lead.phone_raw.replace(/\D/g, '').slice(-8) !== lead.phone_e164?.slice(-8) ? lead.phone_raw : null;

  return (
    <>
      <Topbar crumbs={[{ label: 'Leads', href: '/painel/leads' }, { label: lead.name }]} />
      <main className="space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={lead.name} src={profilePic} seed={lead.id} size={64} />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-balance lg:text-3xl">{lead.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{PIPELINE_COLUMNS.find((c) => c.key === columnOf(lead.stage))!.label}</Badge>
                {lead.flow && <Badge tone={flow.tone}>{flow.label}</Badge>}
                {contact && <Badge tone={STATUS_LABEL[contact.status].tone}>CRM: {STATUS_LABEL[contact.status].label}</Badge>}
                {lead.business_type && <Badge><Briefcase />{lead.business_type}</Badge>}
                {lead.city && <Badge><MapPin />{lead.city}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickLinks lead={lead} large />
            {boardHref && <LinkButton href={boardHref} variant="outline" className="h-9"><LayoutDashboard />Abrir no quadro</LinkButton>}
            {crmHref && <LinkButton href={crmHref} className="h-9"><MessageCircle />Abrir no CRM</LinkButton>}
          </div>
        </header>
        {lead.exit_reason && <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">Saiu da pipeline: {lead.exit_reason}</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Pontuação" value={<>{lead.score ?? '—'}<span className="text-sm font-normal text-muted-foreground"> / 100</span></>} sub={lead.score_reasons ? `${lead.score_reasons.filter((r) => r.met).length} de ${lead.score_reasons.length} critérios` : 'Ainda não analisado'} />
          <Stat label="Google" value={lead.rating !== null ? <span className="inline-flex items-center gap-1.5">{String(lead.rating).replace('.', ',')}<Star className="size-4 fill-warning text-warning" /></span> : '—'} sub={lead.rating !== null ? `${lead.reviews_count} avaliações` : 'Sem nota no Google'} />
          <Stat label="Instagram" value={ig.label.split(' · ')[0]} sub={ig.label.split(' · ')[1] ? `Último post: ${ig.label.split(' · ')[1]}` : null} />
          <Stat label="Site" value={lead.site_status === 'somente_social' ? 'Só rede social' : site.label} sub={lead.website_url?.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')} />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-4">
            <Card className="space-y-4 p-5">
              <h2 className="font-medium">Análise</h2>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{lead.summary ?? 'Sem resumo da análise.'}</p>
              {lead.score_reasons && lead.score_reasons.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {lead.score_reasons.map((r) => (
                    <li key={r.label} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      {r.met ? <Check className="size-4 shrink-0 text-success-foreground" /> : <X className="size-4 shrink-0 text-destructive" />}
                      <span className="min-w-0 flex-1">{r.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{r.met ? `+${r.points}` : `0 de ${r.points}`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {lead.site_signals && lead.site_signals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Sinais do site</p>
                  <div className="flex flex-wrap gap-1.5">{lead.site_signals.map((s) => <Badge key={s.key} tone={s.ok ? 'neutral' : 'warning'}>{s.label}</Badge>)}</div>
                </div>
              )}
              {lead.error && <p className="text-xs text-warning">{lead.error}</p>}
              {lead.flow === 'melhorar_site' && STAGES_WITH_REASON.includes(lead.stage) && (
                <NoteField leadId={id} field="reason" initial={lead.reason} label="Motivo · vai na mensagem" placeholder="ex.: não funciona bem no celular" />
              )}
            </Card>
            <InstagramCard
              leadId={id}
              handle={handle}
              detail={ig.label}
              apify={apify}
              job={job}
              instagram={media.map((m) => ({ url: m.url, href: m.post_url ?? m.url, caption: m.caption }))}
              maps={lead.photos.map((url) => ({ url, href: url, caption: null }))}
            />
          </div>

          <aside className="min-w-0 space-y-4">
            <Card className="p-5">
              <h2 className="mb-1 font-medium">Dados do negócio</h2>
              <dl className="divide-y divide-border">
                <Datum icon={<Smartphone />} label="Celular">{mobile ? <Value copy={lead.phone_e164!}>{mobile}</Value> : '—'}</Datum>
                {landline && <Datum icon={<Phone />} label="Telefone"><Value copy={landline}>{landline}</Value></Datum>}
                <Datum icon={<Mail />} label="E-mail">{lead.email ? <Value copy={lead.email}><a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a></Value> : '—'}</Datum>
                {handle && <Datum icon={<AtSign />} label="Instagram"><Value copy={`@${handle}`}>@{handle}</Value></Datum>}
                {siteHref && <Datum icon={<Globe />} label="Site"><a href={siteHref} target="_blank" rel="noreferrer" className="hover:underline">{siteHref.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a></Datum>}
                <Datum icon={<MapPin />} label="Endereço">{lead.address ?? '—'}</Datum>
                <Datum icon={<FolderSearch />} label="Batch">{batch ? <Link href={boardHref!} className="text-brand-soft hover:underline">{batchLabel(batch)}</Link> : 'Sem batch'}</Datum>
                {clientId && <Datum icon={<Building2 />} label="Cliente"><Link href={`/painel/clientes/${clientId}`} className="text-brand-soft hover:underline">Ver cliente</Link></Datum>}
              </dl>
            </Card>
            <Card className="p-5"><NoteField leadId={id} field="comment" initial={lead.comment} label="Comentário interno" placeholder="Não vai para o lead" /></Card>
            <Card className="p-5">
              <h2 className="mb-3 font-medium">Contatos e dono</h2>
              {lead.enrichment ? <EnrichmentInfo lead={lead} title={false} /> : <p className="text-sm text-muted-foreground">Ainda não pesquisado.</p>}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-medium">Histórico</h2>
              <ol className="relative max-h-72 space-y-3 overflow-y-auto pr-1 [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin]">
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
            {actions.includes('nao_contatar') && (
              <ExitButtons leadId={id} className={`flex flex-wrap justify-end gap-1 ${actions.includes('descartar') ? '' : '[&>form:first-child]:hidden'}`} />
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
