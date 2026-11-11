import { listLeads, listSites, listVideos, type SiteRecord, type VideoRecord } from '@lps/db';
import { formatDuration, type Lead } from '@lps/domain';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { MaterialCard, TemplateButton, type MaterialCardData } from '@/components/material/material-card';
import { Badge, Button, Card, SectionTitle, type Tone } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { loadBatchContext } from '@/lib/batch-context';
import { flowLabel, formatDate, leadMeta } from '@/lib/lead-labels';
import { retryMaterialAction } from './actions';

function generationStatus(lead: Lead): { label: string; tone: Tone; detail?: string } {
  if (lead.needs_data) return { label: 'Faltam dados', tone: 'danger', detail: lead.error ?? undefined };
  if (lead.error) return { label: 'Erro', tone: 'danger', detail: lead.error };
  return { label: 'Montando a página', tone: 'warning', detail: 'Textos, fotos e cores · cerca de 2 min' };
}

const LeadForm = ({ leadId, action, children, variant }: { leadId: string; action: (f: FormData) => Promise<void>; children: React.ReactNode; variant?: 'primary' | 'outline' }) => (
  <form action={action}>
    <input type="hidden" name="leadId" value={leadId} />
    <Button type="submit" variant={variant ?? 'primary'}>{children}</Button>
  </form>
);

function cardData(lead: Lead, site: SiteRecord | undefined, video: VideoRecord | undefined, publicUrl: (path: string) => string): MaterialCardData {
  const state: MaterialCardData['video']['state'] =
    !video ? 'nenhum' : video.status === 'erro' ? 'erro' : video.status === 'pronto' && video.storage_path ? 'pronto' : video.status === 'convertendo' || video.status === 'na_fila' ? 'convertendo' : 'nenhum';
  return {
    leadId: lead.id,
    name: lead.name,
    meta: leadMeta(lead),
    flow: flowLabel(lead),
    slug: site?.slug ?? null,
    screenshots: site?.screenshots ? { mobile: publicUrl(site.screenshots.mobile), desktop: publicUrl(site.screenshots.desktop) } : null,
    video: {
      state,
      duration: video?.duration_seconds ? formatDuration(Number(video.duration_seconds)) : null,
      url: video?.storage_path ? publicUrl(video.storage_path) : null,
      error: video?.error ?? null,
    },
    deadline: site?.expires_at ? `Expira em ${formatDate(site.expires_at)}` : 'Sem prazo até o envio',
    generator: site?.generator ?? null,
  };
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['gerando_material', 'revisar_material']);
  const ids = leads.map((l) => l.id);
  const [sites, videos] = await Promise.all([listSites(db, ids), listVideos(db, ids)]);
  const generating = leads.filter((l) => l.stage === 'gerando_material');
  const ready = leads.filter((l) => l.stage === 'revisar_material');
  const publicUrl = (path: string) => db.storage.from('media').getPublicUrl(path).data.publicUrl;

  return (
    <>
      {generating.some((l) => !l.error && !l.needs_data) && <AutoRefresh ms={3000} />}
      <p className="mb-5 text-sm text-muted-foreground">Página e vídeo de cada lead. Aprovar leva o lead para o CRM.</p>
      <SectionTitle count={generating.length} tone={generating.length ? 'brand' : 'neutral'}>Em geração</SectionTitle>
      <div className="stagger mb-8 space-y-2">
        {generating.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lead em geração.</p>}
        {generating.map((lead) => {
          const status = generationStatus(lead);
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
                {failed && !lead.needs_data && <TemplateButton leadId={lead.id} />}
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
        {ready.map((lead) => (
          <MaterialCard key={lead.id} data={cardData(lead, sites.get(lead.id), videos.get(lead.id), publicUrl)} />
        ))}
      </div>
    </>
  );
}
