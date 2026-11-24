import { batchIdsOfLead, clientsByLead, getContactByLead, getLead, INSTAGRAM_MEDIA_JOB, lastLeadJob, listBatches, listEvents, NO_BATCH, REFRESH_LEAD_JOB } from '@lps/db';
import { availableActions, columnOf, describeEvent, formatPhone, instagramHandle, PIPELINE_COLUMNS } from '@lps/domain';
import { workspaceHasApify } from '@lps/integrations';
import { AtSign, Briefcase, Building2, Check, FileText, FolderSearch, Globe, LayoutDashboard, Loader2, Mail, MapPin, MessageCircle, PanelTop, Smartphone, Star, Store, Trash2, Video, X } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/crm/avatar';
import { Topbar } from '@/components/layout/topbar';
import { EnrichmentInfo } from '@/components/leads/enrichment-info';
import { BlockLeadButton, InlineEdit, LeadBatchField, LinkSquare } from '@/components/leads/editable';
import { InstagramCard } from '@/components/leads/instagram-card';
import { NoteField } from '@/components/leads/note-field';
import { InstagramIcon, instagramUrl, mapsUrl, siteUrl, withProtocol } from '@/components/leads/lead-links';
import { Badge, Button, Card, LinkButton } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { discardLeadAction } from '@/lib/common-lead-actions';
import { listMembers } from '@/lib/members';
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
export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const db = await authedDb();
  const lead = await getLead(db, id);
  if (!lead) notFound();
  const { workspace } = await getSession();
  const [batches, batchIds, events, clients, contact, job, refreshJob, apify, members] = await Promise.all([
    listBatches(db),
    batchIdsOfLead(db, id),
    listEvents(db, id),
    clientsByLead(db, [id]),
    getContactByLead(db, id),
    lastLeadJob(db, INSTAGRAM_MEDIA_JOB, id),
    lastLeadJob(db, REFRESH_LEAD_JOB, id),
    workspaceHasApify(workspace.id),
    listMembers(workspace.id),
  ]);
  const option = (b: (typeof batches)[number]) => ({ value: b.id, label: batchLabel(b) });
  const reading = lead.stage === 'analisando' || refreshJob?.status === 'pendente' || refreshJob?.status === 'executando';
  const author = (data: unknown) => members.find((m) => m.id === (data as { por?: string } | null)?.por)?.name;
  const actions = availableActions(lead);
  const clientId = clients.get(id);
  const flow = flowLabel(lead);
  const site = siteLabel(lead);
  const siteHref = siteUrl(lead);
  const handle = instagramHandle(lead.instagram_url);
  const ig = instagramLabel(lead, lead.score_reasons?.find((r) => r.label.startsWith('Instagram'))?.met);
  const crmHref = contact ? `/painel/crm?contato=${contact.id}` : null;
  const boardHref = `/painel/batches/${lead.batch_id ?? batchIds[0] ?? NO_BATCH}?lead=${id}`;
  const media = lead.instagram_media ?? [];
  const profilePic = media.find((m) => m.kind === 'perfil')?.url ?? null;
  const phone = lead.phone_raw ?? (lead.phone_e164 ? phoneText(lead.phone_e164) : null);
  const mapsHref = lead.maps_url ?? (lead.place_id ? mapsUrl(lead) : null);
  const made = [
    { label: 'Página', href: lead.page_url, icon: <PanelTop /> },
    { label: 'Vídeo', href: lead.loom_url, icon: <Video /> },
  ].filter((m): m is typeof m & { href: string } => !!m.href);

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Leads', href: '/painel/leads' }, { label: lead.name }]}
        actions={
          <>
            {actions.includes('descartar') && (
              <form action={discardLeadAction}>
                <input type="hidden" name="leadId" value={id} />
                <Button type="submit" variant="danger"><Trash2 />Descartar</Button>
              </form>
            )}
            {actions.includes('nao_contatar') && <BlockLeadButton leadId={id} />}
          </>
        }
      />
      {reading && <AutoRefresh ms={4000} />}
      <main className="space-y-4 p-4 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-80 items-center gap-4">
            <Avatar name={lead.name} src={profilePic} seed={lead.id} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl"><InlineEdit leadId={id} field="name" value={lead.name} label="Nome" /></h1>
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
            <span className="flex gap-1.5">
              {made.map((m) => <a key={m.label} href={withProtocol(m.href)} target="_blank" rel="noreferrer" aria-label={m.label} data-tip={m.label} className="flex size-9 items-center justify-center rounded-md border border-border bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 [&_svg]:size-4">{m.icon}</a>)}
              <LinkSquare leadId={id} field="instagram_url" label="Instagram" href={instagramUrl(lead)} text={handle ? `@${handle}` : lead.instagram_url} icon={<InstagramIcon />} placeholder="@perfil ou link" hint="Só fica guardado. Para ler o perfil, use Analisar Instagram." />
              <LinkSquare leadId={id} field="maps_url" label="Google Meu Negócio" href={mapsHref} text={lead.maps_url ?? null} icon={<MapPin />} placeholder="https://maps.app.goo.gl/…" hint="Ao salvar, o sistema puxa os dados do Google." />
              <LinkSquare leadId={id} field="website_url" label="Site" href={siteHref} text={lead.website_url} icon={<Globe />} placeholder="clinica.com.br" hint="Ao salvar, o sistema lê o site de novo." />
            </span>
            <LinkButton href={boardHref} variant="outline" className="h-9"><LayoutDashboard />Abrir no quadro</LinkButton>
            {crmHref && <LinkButton href={crmHref} className="h-9"><MessageCircle />Abrir no CRM</LinkButton>}
          </div>
        </header>
        {aviso === 'existente' && <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">Esse negócio já existia: esta é a ficha dele, com os dados que faltavam.</p>}
        {reading && <p role="status" className="flex items-center gap-2 rounded-md bg-brand-muted px-3 py-2 text-sm text-brand-light"><Loader2 className="size-4 animate-spin" />Puxando e analisando os dados…</p>}
        {!reading && refreshJob?.status === 'erro' && <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">A última leitura falhou: {refreshJob.error}</p>}
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
                <Datum icon={<Smartphone />} label="Celular"><InlineEdit leadId={id} field="phone" value={phone} label="Celular" /></Datum>
                <Datum icon={<Mail />} label="E-mail"><InlineEdit leadId={id} field="email" value={lead.email} label="E-mail" /></Datum>
                <Datum icon={<Briefcase />} label="Tipo"><InlineEdit leadId={id} field="business_type" value={lead.business_type} label="Tipo de negócio" /></Datum>
                <Datum icon={<Store />} label="Cidade"><InlineEdit leadId={id} field="city" value={lead.city} label="Cidade" /></Datum>
                <Datum icon={<MapPin />} label="Endereço"><InlineEdit leadId={id} field="address" value={lead.address} label="Endereço" multiline /></Datum>
                <Datum icon={<AtSign />} label="Instagram"><InlineEdit leadId={id} field="instagram_url" value={handle ? `@${handle}` : lead.instagram_url} label="Instagram" /></Datum>
                <Datum icon={<Globe />} label="Site"><InlineEdit leadId={id} field="website_url" value={lead.website_url} label="Site" display={lead.website_url?.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')} /></Datum>
                <Datum icon={<FileText />} label="Descrição"><InlineEdit leadId={id} field="description" value={lead.description} label="Descrição" multiline display={lead.description ? <span className="line-clamp-4">{lead.description}</span> : undefined} /></Datum>
                <Datum icon={<FolderSearch />} label="Batch"><LeadBatchField leadId={id} current={lead.batch_id} options={batches.map(option)} others={batches.filter((b) => b.id !== lead.batch_id && batchIds.includes(b.id)).map(option)} /></Datum>
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
                    <span className="min-w-0 [overflow-wrap:anywhere]">{describeEvent(e)}{author(e.data) && <span className="block text-xs text-muted-foreground">{author(e.data)}</span>}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
                  </li>
                ))}
                {events.length === 0 && <li className="text-sm text-muted-foreground">Sem eventos ainda.</li>}
              </ol>
            </Card>
          </aside>
        </div>
      </main>
    </>
  );
}
