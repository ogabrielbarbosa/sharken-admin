'use client';

import { buildBriefing, canCompleteInfo, type Lead, type LeadAsset } from '@lps/domain';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { AssetList, LinkAdder } from '@/components/leads/asset-list';
import { FileDrop } from '@/components/leads/file-drop';
import { NoteField } from '@/components/leads/note-field';
import { NotesAssetField } from '@/components/leads/notes-asset-field';
import { Badge, Button } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { CopyButton } from '@/components/ui/copy-button';
import { completeInfoAction, discardAction, saveLeadFieldAction } from '@/app/painel/batches/[id]/actions';
import { flowLabel, leadMeta } from '@/lib/lead-labels';
import { Notice, useStageAction } from './board';
import { Modal } from './modal';

const fullUrl = (url: string) => (/^https?:/i.test(url) ? url : `https://${url}`);
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{title}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

const label = (t: string) => <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{t}</p>;

/** Modal de Qualificado: o que o sistema tem, o que o Gabriel acrescenta, briefing e "Informações completas". */
export function CompleteModal({ lead, assets, position, prevHref, nextHref, closeHref, workerStale, materialLinks }: {
  lead: Lead; assets: LeadAsset[]; materialLinks: Record<string, string>; position: string; prevHref: string | null; nextHref: string | null; closeHref: string; workerStale: boolean;
}) {
  const router = useRouter();
  const { pending, notice, run } = useStageAction(closeHref);
  const links = assets.filter((a) => a.kind === 'link');
  const files = assets.filter((a) => a.kind === 'arquivo');
  const text = assets.find((a) => a.kind === 'texto');
  const extracting = assets.some((a) => a.status === 'extraindo');
  const check = canCompleteInfo(lead, assets);
  const flow = flowLabel(lead);
  const photos = [...new Set([...(lead.instagram_media ?? []).map((m) => m.url), ...lead.photos, ...assets.filter((a) => a.status === 'pronto').flatMap((a) => a.extracted_images ?? [])])];
  const close = () => router.replace(closeHref, { scroll: false });
  const nav = (href: string | null, name: string, icon: ReactNode) =>
    href ? <Link href={href} replace scroll={false} aria-label={name} className="text-muted-foreground hover:text-foreground">{icon}</Link> : <span className="text-muted-foreground/30">{icon}</span>;

  return (
    <Modal
      wide
      title={lead.name}
      subtitle={<span className="flex flex-wrap items-center gap-2">{leadMeta(lead)}<Badge tone={flow.tone}>Fluxo {flow.label.toLowerCase()}</Badge></span>}
      closeHref={closeHref}
      nav={<><span className="text-xs text-muted-foreground">{position}</span>{nav(prevHref, 'Lead anterior', <ChevronLeft className="size-4" />)}{nav(nextHref, 'Próximo lead', <ChevronRight className="size-4" />)}</>}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => discardAction([lead.id]), (r) => { if (r.ok) close(); })}><Trash2 />Descartar</Button>
          <div className="flex flex-wrap items-center gap-2">
            {!check.ok && <span className="text-xs text-muted-foreground">{check.reason}</span>}
            <CopyButton text={buildBriefing(lead, assets, (p) => materialLinks[p] ?? null)} label="Copiar briefing" />
            <Button disabled={pending || !check.ok} onClick={() => run(() => completeInfoAction(lead.id), (r) => { if (r.ok) close(); })}><ArrowRight />Informações completas</Button>
          </div>
        </>
      }
    >
      {extracting && <AutoRefresh ms={4000} />}
      {(workerStale && extracting) || notice ? (
        <div className="space-y-2 px-6 pt-4">
          {workerStale && extracting && (
            <p className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
              <TriangleAlert className="size-4 shrink-0" />O worker parece parado: há itens esperando há mais de 2 minutos. Confira se o Mac está ligado e o worker rodando.
            </p>
          )}
          <Notice notice={notice} />
        </div>
      ) : null}
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="space-y-4 border-b border-border p-6 lg:border-b-0 lg:border-r">
          {label('O que o sistema já tem')}
          <dl>
            <Row title="Telefone">{lead.phone_raw ?? '—'}</Row>
            <Row title="Endereço">{lead.address ?? '—'}</Row>
            <Row title="Categorias">{lead.categories.length ? lead.categories.join(', ') : '—'}</Row>
            <Row title="Google">{lead.rating != null ? `${lead.rating} · ${lead.reviews_count} avaliações` : '—'}</Row>
            <Row title="Site">{lead.website_url && lead.site_status !== 'somente_social' ? <a href={fullUrl(lead.website_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{shortUrl(lead.website_url)}<ExternalLink className="size-3" /></a> : lead.site_status === 'somente_social' ? 'Só rede social' : 'Sem site'}</Row>
            <Row title="Instagram">{lead.instagram_url ? <a href={fullUrl(lead.instagram_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">@{shortUrl(lead.instagram_url).split('/')[1] ?? shortUrl(lead.instagram_url)}<ExternalLink className="size-3" /></a> : 'Sem Instagram'}</Row>
          </dl>
          {photos.length > 0 && (
            <>
              {label(`Fotos · ${photos.length}`)}
              <div className="grid grid-cols-3 gap-2">
                {photos.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                  </a>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-6 p-6">
          {lead.flow === 'melhorar_site' && (
            <NoteField key={`reason-${lead.id}`} leadId={lead.id} field="reason" initial={lead.reason} label="Motivo · aparece na mensagem" placeholder="ex.: o site não abre bem no celular" save={saveLeadFieldAction} />
          )}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Links</h3>
              <p className="text-xs text-muted-foreground">Site, Instagram, Linktree, Doctoralia, currículo. O sistema lê cada um.</p>
            </div>
            <AssetList assets={links} />
            <LinkAdder key={`link-${lead.id}`} leadId={lead.id} />
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Arquivos</h3>
              <p className="text-xs text-muted-foreground">PDF, imagens e documentos, até 20 MB cada.</p>
            </div>
            <AssetList assets={files} />
            <FileDrop key={`file-${lead.id}`} leadId={lead.id} />
          </div>
          <NotesAssetField key={`notes-${lead.id}`} leadId={lead.id} initial={text?.body ?? ''} />
          <NoteField key={`comment-${lead.id}`} leadId={lead.id} field="comment" initial={lead.comment} label="Comentário interno" placeholder="Não vai para o lead…" save={saveLeadFieldAction} />
        </section>
      </div>
    </Modal>
  );
}
