'use client';

import { ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { Lead } from '@lps/domain';
import { Badge, Button, Status } from '@/components/ui';
import { ExitButtons } from './exit-buttons';
import { NoteField } from './note-field';
import { advanceLeadsAction } from '@/app/painel/batches/[id]/revisar/actions';
import { siteLabel, leadMeta } from '@/lib/lead-labels';

/** Painel lateral do lead. As setas do teclado passam para o anterior e o próximo da lista filtrada. */
export function LeadDrawer({ lead, batchId, prevHref, nextHref, closeHref }: { lead: Lead; batchId: string; prevHref: string | null; nextHref: string | null; closeHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && prevHref) router.replace(prevHref, { scroll: false });
      else if (e.key === 'ArrowRight' && nextHref) router.replace(nextHref, { scroll: false });
      else if (e.key === 'Escape') router.replace(closeHref, { scroll: false });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prevHref, nextHref, closeHref, router]);

  const site = siteLabel(lead);
  const nav = (href: string | null, label: string, icon: React.ReactNode) =>
    href ? <Link href={href} replace scroll={false} aria-label={label} className="text-muted-foreground hover:text-foreground">{icon}</Link> : <span className="text-muted-foreground/30">{icon}</span>;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} replace scroll={false} aria-label="Fechar" className="absolute inset-0 bg-black/60" />
      <aside className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{lead.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{leadMeta(lead)}</p>
          </div>
          <div className="flex items-center gap-2">
            {nav(prevHref, 'Lead anterior', <ChevronLeft className="size-4" />)}
            {nav(nextHref, 'Próximo lead', <ChevronRight className="size-4" />)}
            <Link href={closeHref} replace scroll={false} aria-label="Fechar painel" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="text-foreground"><Status tone={site.tone}>{site.label}</Status></span>
          {lead.website_url && <a href={/^https?:/i.test(lead.website_url) ? lead.website_url : `https://${lead.website_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{lead.website_url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}<ExternalLink className="size-3" /></a>}
          <Link href={`/painel/leads/${lead.id}`} className="hover:text-foreground">Abrir ficha</Link>
        </div>
        {lead.score_reasons && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Critérios</h3>
            <div className="flex flex-wrap gap-1.5">
              {lead.score_reasons.map((r) => <Badge key={r.label} tone={r.met ? 'success' : 'danger'}>{r.met ? <Check /> : <X />}{r.label}</Badge>)}
            </div>
          </section>
        )}
        {lead.site_signals && lead.site_signals.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sinais do site</h3>
            <div className="flex flex-wrap gap-1.5">{lead.site_signals.map((s) => <Badge key={s.key} tone={s.ok ? 'neutral' : 'warning'}>{s.label}</Badge>)}</div>
          </section>
        )}
        {lead.summary && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumo da IA</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{lead.summary}</p>
          </section>
        )}
        {lead.error && <p className="text-xs text-warning">{lead.error}</p>}
        {lead.flow === 'melhorar_site' && lead.reason && (
          <section className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Motivo</h3>
            <p className="text-sm">{lead.reason}</p>
          </section>
        )}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comentário interno</h3>
          <NoteField key={lead.id} leadId={lead.id} field="comment" initial={lead.comment} placeholder="Não vai para o lead…" />
        </section>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <ExitButtons leadId={lead.id} />
          <form action={advanceLeadsAction}>
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="ids" value={lead.id} />
            <Button type="submit"><ArrowRight />Avançar</Button>
          </form>
        </div>
      </aside>
    </div>
  );
}
