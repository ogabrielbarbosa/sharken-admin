import { listLeads, listSites, listVideos, type VideoRecord } from '@lps/db';
import { checkDuration, type Lead } from '@lps/domain';
import { Check, ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { Badge, Button, Card, LinkButton, PageHeader, Status, type Tone } from '@/components/ui';
import { loadBatchContext } from '@/lib/batch-context';
import { flowLabel, leadMeta } from '@/lib/lead-labels';
import { approveMaterialAction, redoMaterialAction, retryMaterialAction } from './actions';

function generationStatus(lead: Lead, hasSite: boolean, video?: VideoRecord): { label: string; tone: Tone; detail?: string } {
  if (lead.needs_data) return { label: 'Faltam dados', tone: 'danger', detail: lead.error ?? undefined };
  if (video?.status === 'erro') return { label: 'Erro', tone: 'danger', detail: video.error ?? undefined };
  if (lead.error) return { label: 'Erro', tone: 'danger', detail: lead.error };
  if (hasSite && video) return { label: 'Renderizando vídeo', tone: 'warning', detail: `${video.progress}% concluído` };
  return { label: 'Gerando página', tone: 'warning' };
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
      <PageHeader title="Material" description="Páginas e vídeos gerados para cada lead. Revise antes de seguir para a abordagem." />
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">Em geração <Badge>{generating.length}</Badge></h2>
      <div className="mb-8 space-y-2">
        {generating.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lead em geração.</p>}
        {generating.map((lead) => {
          const status = generationStatus(lead, sites.has(lead.id), videos.get(lead.id));
          const failed = status.tone === 'danger';
          return (
            <Card key={lead.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
              </div>
              <div className="min-w-48 flex-1 text-sm">
                <Status tone={status.tone}>{status.label}</Status>
                {status.detail && <p className={`mt-1 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{status.detail}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {failed && <LeadForm leadId={lead.id} action={retryMaterialAction} variant="outline"><RotateCcw />Tentar de novo</LeadForm>}
                <ExitButtons leadId={lead.id} />
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">Prontos para revisão <Badge>{ready.length}</Badge></h2>
      {ready.length === 0 && <p className="text-sm text-muted-foreground">Nada para revisar agora.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ready.map((lead) => {
          const site = sites.get(lead.id);
          const video = videos.get(lead.id);
          const flow = flowLabel(lead);
          const duration = video?.duration_seconds ? checkDuration(Number(video.duration_seconds)) : 'ok';
          return (
            <Card key={lead.id} className="flex flex-col overflow-hidden">
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
