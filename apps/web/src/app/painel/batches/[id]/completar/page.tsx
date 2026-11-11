import { listAssets, listLeads } from '@lps/db';
import { type Lead, type LeadAsset } from '@lps/domain';
import { Check, CheckCircle2, Circle, CircleDot, ExternalLink, Inbox } from 'lucide-react';
import Link from 'next/link';
import { AssetList, LinkAdder } from '@/components/leads/asset-list';
import { FileDrop } from '@/components/leads/file-drop';
import { GenerateBar } from '@/components/leads/generate-bar';
import { NoteField } from '@/components/leads/note-field';
import { NotesAssetField } from '@/components/leads/notes-asset-field';
import { Badge, EmptyState, LinkButton } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { loadBatchContext } from '@/lib/batch-context';
import { flowLabel, leadMeta } from '@/lib/lead-labels';
import { saveLeadFieldAction } from './actions';

const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

function queueState(lead: Lead, currentId: string): { label: string; icon: React.ReactNode } {
  if (lead.id === currentId) return { label: 'Completando agora', icon: <CircleDot className="size-4 text-foreground" /> };
  if (lead.stage === 'completar') return { label: 'Na fila', icon: <Circle className="size-4 text-muted-foreground" /> };
  if (lead.stage === 'descartado' || lead.stage === 'nao_contatar') return { label: 'Descartado', icon: <Circle className="size-4 text-muted-foreground/50" /> };
  return { label: 'Gerando material', icon: <CheckCircle2 className="size-4 text-success" /> };
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{title}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export default async function CompletarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const { db } = await loadBatchContext(id);

  const ids = (query.ids ?? '').split(',').filter(Boolean);
  const inBatch = await listLeads(db, id);
  const byId = new Map(inBatch.map((l) => [l.id, l]));
  const queue: Lead[] = ids.length ? ids.map((i) => byId.get(i)).filter((l): l is Lead => !!l) : inBatch.filter((l) => l.stage === 'completar');
  const pending = queue.filter((l) => l.stage === 'completar');
  const requested = query.lead ? byId.get(query.lead) : undefined;
  const current = requested?.stage === 'completar' ? requested : pending[0];

  if (!current) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Nada para completar"
        description="Avance leads na etapa Leads para juntar links, arquivos e notas antes de gerar o material."
        actions={<LinkButton href={`/painel/batches/${id}/${queue.length ? 'material' : 'revisar'}`} variant="outline">{queue.length ? 'Ver material' : 'Ir para Leads'}</LinkButton>}
      />
    );
  }

  const assets = await listAssets(db, current.id);
  const links = assets.filter((a) => a.kind === 'link');
  const files = assets.filter((a) => a.kind === 'arquivo');
  const text = assets.find((a) => a.kind === 'texto');
  const extracting = assets.filter((a: LeadAsset) => a.status === 'extraindo');
  const allLinks = extracting.every((a) => a.kind === 'link');
  const hint = extracting.length
    ? `${extracting.length} ${allLinks ? (extracting.length === 1 ? 'link ainda em extração' : 'links ainda em extração') : (extracting.length === 1 ? 'item ainda em extração' : 'itens ainda em extração')}. O material começa assim que ${extracting.length === 1 ? 'ele terminar' : 'eles terminarem'}.`
    : null;

  const position = Math.max(0, queue.findIndex((l) => l.id === current.id)) + 1;
  const done = queue.filter((l) => l.stage !== 'completar').length;
  const qs = (leadId: string) => `?${new URLSearchParams({ ...(ids.length ? { ids: ids.join(',') } : {}), lead: leadId }).toString()}`;
  const flow = flowLabel(current);
  const igUrl = current.instagram_url;
  const siteUrl = current.website_url;
  const photos = current.photos.slice(0, 6);

  return (
    <div className="flex min-h-[640px] overflow-hidden rounded-card border border-border bg-card">
      {extracting.length > 0 && <AutoRefresh ms={4000} />}
      <aside className="hidden w-60 shrink-0 border-r border-border p-4 lg:block">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Fila · {position} de {queue.length}</p>
        <div className="mt-2 h-0.5 rounded bg-secondary"><div className="h-full rounded bg-foreground" style={{ width: `${(Math.min(done + 1, queue.length) / queue.length) * 100}%` }} /></div>
        <ul className="mt-4 space-y-1">
          {queue.map((lead) => {
            const state = queueState(lead, current.id);
            const body = (
              <>
                <span className="mt-0.5 shrink-0">{state.icon}</span>
                <span className="min-w-0"><span className="block truncate text-sm">{lead.name}</span><span className="block text-xs text-muted-foreground">{state.label}</span></span>
              </>
            );
            const cls = `flex items-start gap-3 rounded-md px-3 py-2 ${lead.id === current.id ? 'bg-secondary' : ''}`;
            return <li key={lead.id}>{lead.stage === 'completar' ? <Link href={qs(lead.id)} className={`${cls} hover:bg-accent`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{current.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {leadMeta(current)}
              <Badge tone={flow.tone}>Fluxo {flow.label.toLowerCase()}</Badge>
              {current.score != null && <span className="inline-flex items-center gap-2 font-medium text-foreground">{current.score}<span className="h-1 w-10 rounded bg-secondary"><span className="block h-full rounded bg-success" style={{ width: `${current.score}%` }} /></span></span>}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5" />Salvo automaticamente</span>
        </header>

        <div className="grid flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="space-y-4 border-b border-border p-6 lg:border-b-0 lg:border-r">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">O que o sistema já tem</p>
            <dl>
              <Row title="Telefone">{current.phone_raw ?? '—'}</Row>
              <Row title="Endereço">{current.address ?? '—'}</Row>
              <Row title="Categorias">{current.categories.length ? current.categories.join(', ') : '—'}</Row>
              <Row title="Google">{current.rating != null ? `${current.rating} · ${current.reviews_count} avaliações` : '—'}</Row>
              <Row title="Instagram">{igUrl ? <a href={fullUrl(igUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">@{shortUrl(igUrl).split('/')[1] ?? shortUrl(igUrl)}<ExternalLink className="size-3" /></a> : 'Sem Instagram'}</Row>
              <Row title="Site">{siteUrl && current.site_status !== 'somente_social' ? <a href={fullUrl(siteUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{shortUrl(siteUrl)}<ExternalLink className="size-3" /></a> : current.site_status === 'somente_social' ? 'Só rede social' : 'Sem site'}</Row>
            </dl>
            {photos.length > 0 && (
              <>
                <p className="pt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Fotos encontradas · {current.photos.length}</p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" className="aspect-square w-full rounded-md object-cover" />
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="space-y-6 p-6">
            {current.flow === 'melhorar_site' && (
              <NoteField key={`reason-${current.id}`} leadId={current.id} field="reason" initial={current.reason} label="Motivo · aparece na mensagem e no vídeo" placeholder="ex.: o site não abre bem no celular" save={saveLeadFieldAction} />
            )}
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">Links</h2>
                <p className="text-xs text-muted-foreground">Site, Instagram, Linktree, Doctoralia, currículo. O sistema lê cada um.</p>
              </div>
              <AssetList assets={links} />
              <LinkAdder key={`link-${current.id}`} leadId={current.id} />
            </div>
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-medium">Arquivos</h2>
                <p className="text-xs text-muted-foreground">PDF, imagens e documentos, até 20 MB cada.</p>
              </div>
              <AssetList assets={files} />
              <FileDrop key={`file-${current.id}`} leadId={current.id} />
            </div>
            <NotesAssetField key={`notes-${current.id}`} leadId={current.id} initial={text?.body ?? ''} />
            <NoteField key={`comment-${current.id}`} leadId={current.id} field="comment" initial={current.comment} label="Comentário interno" placeholder="Não vai para o lead…" save={saveLeadFieldAction} />
          </section>
        </div>

        <GenerateBar leadId={current.id} batchId={id} ids={ids} hint={hint} canSkip={pending.length > 1} />
      </div>
    </div>
  );
}
