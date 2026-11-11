import { listLeads, listSites, listVideos, type VideoRecord } from '@lps/db';
import { checkDuration, type Lead } from '@lps/domain';
import { AlertCircle, Check, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { Badge, Button, Card, LinkButton, SectionTitle, Status, type Tone } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { loadBatchContext } from '@/lib/batch-context';
import { flowLabel, leadMeta } from '@/lib/lead-labels';
import { approveMaterialAction, redoMaterialAction, retryMaterialAction } from './actions';

function generationStatus(lead: Lead, hasSite: boolean, video?: VideoRecord): { label: string; tone: Tone; detail?: string } {
  if (lead.needs_data) return { label: 'Faltam dados', tone: 'danger', detail: lead.error ?? undefined };
  if (video?.status === 'erro') return { label: 'Erro', tone: 'danger', detail: video.error ?? undefined };
  if (lead.error) return { label: 'Erro', tone: 'danger', detail: lead.error };
  if (hasSite && video) return { label: 'Renderizando vídeo', tone: 'warning', detail: `${video.progress}% concluído` };
  return { label: 'Gerando página', tone: 'warning', detail: 'Textos, fotos e cores · cerca de 15 s' };
}

const LeadForm = ({ leadId, action, children, variant }: { leadId: string; action: (f: FormData) => Promise<void>; children: React.ReactNode; variant?: 'primary' | 'outline' }) => (
  <form action={action}>
    <input type="hidden" name="leadId" value={leadId} />
    <Button type="submit" variant={variant ?? 'primary'}>{children}</Button>
  </form>
);

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['gerando_material', 'revisar_material']);
  const ids = leads.map((l) => l.id);
  const [sites, videos] = await Promise.all([listSites(db, ids), listVideos(db, ids)]);
  const generating = leads.filter((l) => l.stage === 'gerando_material');
  const ready = leads.filter((l) => l.stage === 'revisar_material');

  return (
    <>
      {generating.some((l) => !l.error && !l.needs_data) && <AutoRefresh ms={3000} />}
      <SectionTitle count={generating.length} tone={generating.length ? 'brand' : 'neutral'}>Em geração</SectionTitle>
      <div className="stagger mb-8 space-y-2">
        {generating.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lead em geração.</p>}
        {generating.map((lead) => {
          const status = generationStatus(lead, sites.has(lead.id), videos.get(lead.id));
          const failed = status.tone === 'danger';
          return (
            <Card key={lead.id} className="relative flex flex-col gap-3 overflow-hidden p-4 sm:flex-row sm:items-center">
              {!failed && <div aria-hidden className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-brand-bright/[0.07] to-transparent bg-size-[200%_100%]" />}
              <div className="min-w-0 flex-1">
                <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
              </div>
              <div className="flex min-w-0 items-center gap-2.5 sm:w-72">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${failed ? 'bg-destructive-subtle text-destructive' : 'bg-brand-muted text-brand-soft ring-1 ring-brand-border'}`}>
                  {failed ? <AlertCircle className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{status.label}</p>
                  {status.detail && <p className={`truncate text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`} title={status.detail}>{status.detail}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                {failed && <LeadForm leadId={lead.id} action={retryMaterialAction} variant="outline"><RotateCcw />Tentar de novo</LeadForm>}
                <ExitButtons leadId={lead.id} />
              </div>
            </Card>
          );
        })}
      </div>

      <SectionTitle count={ready.length} tone={ready.length ? 'brand' : 'neutral'}>Prontos para revisão</SectionTitle>
      {ready.length === 0 && <p className="text-sm text-muted-foreground">Nada para revisar agora.</p>}
      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ready.map((lead) => {
          const site = sites.get(lead.id);
          const video = videos.get(lead.id);
          const flow = flowLabel(lead);
          const duration = video?.duration_seconds ? checkDuration(Number(video.duration_seconds)) : 'ok';
          return (
            <Card key={lead.id} interactive className="flex flex-col overflow-hidden">
              {site?.content.videoUrl
                ? <video src={site.content.videoUrl} controls preload="metadata" className="aspect-video w-full bg-black" />
                : <div className="flex aspect-video items-center justify-center bg-secondary text-sm text-muted-foreground">Sem vídeo neste fluxo</div>}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                  <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Status tone={flow.tone}>{flow.label}</Status>
                  {duration !== 'ok' && <Badge tone="warning">Vídeo {duration === 'curto' ? 'abaixo de 60 s' : 'acima de 90 s'}</Badge>}
                </div>
                {site && <LinkButton href={`/p/${site.slug}`} variant="outline" external><ExternalLink />Abrir página</LinkButton>}
                <div className="grid grid-cols-2 gap-2">
                  <LeadForm leadId={lead.id} action={approveMaterialAction}><Check />Aprovar</LeadForm>
                  <LeadForm leadId={lead.id} action={redoMaterialAction} variant="outline"><RefreshCw />Refazer</LeadForm>
                </div>
                <ExitButtons leadId={lead.id} className="flex justify-between" />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
