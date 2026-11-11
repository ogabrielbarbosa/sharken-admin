'use client';

import { ArrowRight, Ban, Check, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Lead } from '@lps/domain';
import { Badge, Button, Status } from '@/components/ui';
import { blockLeadAction, discardLeadAction } from '@/lib/common-lead-actions';
import { NoteField } from './note-field';
import { advanceLeadsAction } from '@/app/painel/batches/[id]/revisar/actions';
import { siteLabel, leadMeta, instagramLabel } from '@/lib/lead-labels';

/** Painel lateral do lead. As setas do teclado passam para o anterior e o próximo da lista filtrada. */
export function LeadDrawer({ lead, batchId, position, prevHref, nextHref, closeHref }: { lead: Lead; batchId: string; position: string; prevHref: string | null; nextHref: string | null; closeHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && prevHref) router.replace(prevHref, { scroll: false });
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && nextHref) router.replace(nextHref, { scroll: false });
      else if (e.key === 'Escape') router.replace(closeHref, { scroll: false });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prevHref, nextHref, closeHref, router]);

  const site = siteLabel(lead);
  const score = lead.score ?? 0;
  const igActive = lead.score_reasons?.find((r) => r.label.startsWith('Instagram'))?.met;
  const ig = instagramLabel(lead, igActive);
  const url = lead.website_url?.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const nav = (href: string | null, label: string, icon: React.ReactNode) =>
    href ? <Link href={href} replace scroll={false} aria-label={label} className="text-muted-foreground hover:text-foreground">{icon}</Link> : <span className="text-muted-foreground/30">{icon}</span>;
  const meta = [leadMeta(lead), lead.phone_raw].filter(Boolean).join(' · ');
  const Stat = ({ title, value, sub }: { title: string; value: string; sub?: string }) => (
    <div className="min-w-0 rounded-md border border-border p-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  const title = (t: string) => <h3 className="text-sm font-medium">{t}</h3>;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} replace scroll={false} aria-label="Fechar" className="absolute inset-0 bg-black/60" />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">{position}</span>
            {nav(prevHref, 'Lead anterior', <ChevronUp className="size-4" />)}
            {nav(nextHref, 'Próximo lead', <ChevronDown className="size-4" />)}
            <Link href={closeHref} replace scroll={false} aria-label="Fechar painel" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-5 p-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat title="Site" value={site.label} sub={url} />
            <Stat title="Instagram" value={ig.label.split(' · ')[0]} sub={lead.instagram_url && lead.instagram_last_post_at ? `último post ${(ig.label.split(' · ')[1] ?? '').replace(/^(\d)/, 'há $1')}`.trim() : undefined} />
            <Stat title="Avaliações" value={lead.rating != null ? `${lead.rating} · ${lead.reviews_count}` : '—'} sub="Google Maps" />
            <Stat title="Pontuação" value={`${score} / 100`} />
          </div>
          {lead.score_reasons && (
            <section className="space-y-2">
              {title('Critérios')}
              <div className="flex flex-wrap gap-1.5">
                {lead.score_reasons.map((r) => <Badge key={r.label} tone={r.met ? 'success' : 'danger'}>{r.met ? <Check /> : <X />}{r.label}</Badge>)}
              </div>
            </section>
          )}
          {lead.site_signals && lead.site_signals.length > 0 && (
            <section className="space-y-2">
              {title('Sinais do site')}
              <div className="flex flex-wrap gap-1.5">{lead.site_signals.map((s) => <Badge key={s.key} tone={s.ok ? 'neutral' : 'warning'}>{s.label}</Badge>)}</div>
            </section>
          )}
          {lead.summary && (
            <section className="space-y-2">
              {title('Resumo da análise')}
              <p className="text-sm leading-relaxed text-muted-foreground">{lead.summary}</p>
            </section>
          )}
          {lead.error && <p className="text-xs text-warning">{lead.error}</p>}
          {lead.flow === 'melhorar_site' && (
            <NoteField key={`reason-${lead.id}`} leadId={lead.id} field="reason" initial={lead.reason} label="Motivo · aparece na mensagem e no vídeo" placeholder="ex.: o site não abre bem no celular" />
          )}
          <NoteField key={`comment-${lead.id}`} leadId={lead.id} field="comment" initial={lead.comment} label="Comentário interno" placeholder="Não vai para o lead…" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <form action={blockLeadAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <Button type="submit" variant="ghost"><Ban />Não contatar</Button>
          </form>
          <div className="flex items-center gap-2">
            <form action={discardLeadAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Button type="submit" variant="outline"><Trash2 />Descartar</Button>
            </form>
            <form action={advanceLeadsAction}>
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="ids" value={lead.id} />
              <Button type="submit"><ArrowRight />Avançar e completar</Button>
            </form>
          </div>
        </div>
      </aside>
    </div>
  );
}
