import type { ContactStatus, Lead, LeadAsset } from '@lps/domain';
import { Check, Loader2, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Status } from '@/components/ui';
import { STATUS_LABEL } from '@/lib/crm';
import { leadMeta, siteLabel } from '@/lib/lead-labels';

export type CardContact = { id: string; status: ContactStatus };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const domainOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0];

/** "2 links · 1 PDF · 4 fotos": o que o Gabriel acrescentou ao lead. */
export function assetSummary(assets: Pick<LeadAsset, 'kind' | 'status' | 'mime_type' | 'extracted_images'>[]): { text: string; extracting: number } {
  const links = assets.filter((a) => a.kind === 'link').length;
  const files = assets.filter((a) => a.kind === 'arquivo');
  const images = files.filter((a) => a.mime_type?.startsWith('image/')).length;
  const pdfs = files.filter((a) => a.mime_type === 'application/pdf').length;
  const others = files.length - images - pdfs;
  const photos = images + assets.reduce((n, a) => n + (a.status === 'pronto' ? a.extracted_images?.length ?? 0 : 0), 0);
  const notes = assets.some((a) => a.kind === 'texto');
  const parts = [
    links && plural(links, 'link', 'links'),
    pdfs && plural(pdfs, 'PDF', 'PDFs'),
    others && plural(others, 'arquivo', 'arquivos'),
    photos && plural(photos, 'foto', 'fotos'),
    notes && 'notas',
  ].filter(Boolean);
  return { text: parts.length ? parts.join(' · ') : 'Nada acrescentado', extracting: assets.filter((a) => a.status === 'extraindo').length };
}

const STAGE_LABEL: Partial<Record<Lead['stage'], string>> = { crm: 'No CRM', vendido: 'Vendido', sem_interesse: 'Sem interesse', nao_contatar: 'Não contatar', descartado: 'Descartado' };

function Shell({ lead, active, children }: { lead: Lead; active?: boolean; children: ReactNode }) {
  return (
    <li data-testid={`card-${lead.id}`} className={`rounded-md border bg-card p-3 text-sm ${active ? 'border-neutral-400' : 'border-border'}`}>
      {children}
    </li>
  );
}

const Title = ({ lead }: { lead: Lead }) => (
  <>
    <span className="block truncate font-medium">{lead.name}</span>
    <span className="block truncate text-xs text-muted-foreground">{leadMeta(lead)}</span>
  </>
);

/** Cartão inteiro clicável, para as colunas em que clicar abre o modal ou a conversa. */
function LinkCard({ lead, href, active, children }: { lead: Lead; href: string; active?: boolean; children: ReactNode }) {
  return (
    <Shell lead={lead} active={active}>
      <Link href={href} scroll={false} className="-m-3 block rounded-md p-3 hover:bg-accent/40">
        <Title lead={lead} />
        <span className="mt-2 block text-xs">{children}</span>
      </Link>
    </Shell>
  );
}

export function LeadCard({ lead, href, active, assets, contact, selected, onSelect, onQualify, onDiscard, pending }: {
  lead: Lead; href: string; active?: boolean; assets?: LeadAsset[]; contact?: CardContact;
  selected?: boolean; onSelect?: () => void; onQualify?: () => void; onDiscard?: () => void; pending?: boolean;
}) {
  switch (lead.stage) {
    case 'analisando':
      return (
        <Shell lead={lead}>
          <Title lead={lead} />
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Analisando…</span>
        </Shell>
      );
    case 'revisar': {
      const site = siteLabel(lead);
      const score = lead.score ?? 0;
      return (
        <Shell lead={lead} active={active}>
          <div className="flex items-start gap-2">
            <input type="checkbox" aria-label={`Selecionar ${lead.name}`} checked={!!selected} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-neutral-200" />
            <Link href={href} scroll={false} className="min-w-0 flex-1 hover:underline"><Title lead={lead} /></Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Status tone={site.tone}>{site.label}</Status>
            {lead.rating != null && <span className="inline-flex items-center gap-1"><Star className="size-3" />{lead.rating} ({lead.reviews_count})</span>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-6 text-xs font-medium">{score}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><span className={`block h-full ${score >= 70 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${score}%` }} /></span>
            <button type="button" disabled={pending} onClick={onDiscard} aria-label={`Descartar ${lead.name}`} title="Descartar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"><Trash2 className="size-4" /></button>
            <button type="button" disabled={pending} onClick={onQualify} aria-label={`Qualificar ${lead.name}`} title="Qualificar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"><Check className="size-4" /></button>
          </div>
        </Shell>
      );
    }
    case 'completar': {
      const { text, extracting } = assetSummary(assets ?? []);
      return (
        <LinkCard lead={lead} href={href} active={active}>
          <span className="block text-muted-foreground">{text}</span>
          {extracting > 0 && <span className="mt-1 inline-flex items-center gap-1 text-warning"><Loader2 className="size-3 animate-spin" />{extracting} em extração</span>}
        </LinkCard>
      );
    }
    case 'pagina':
      return <LinkCard lead={lead} href={href} active={active}><span className="text-warning">Falta a página</span></LinkCard>;
    case 'video':
      return (
        <LinkCard lead={lead} href={href} active={active}>
          {lead.page_url && <span className="block text-muted-foreground">{domainOf(lead.page_url)}</span>}
          <span className="block text-warning">{lead.loom_url ? 'Loom salvo, falta levar ao CRM' : 'Falta o Loom'}</span>
        </LinkCard>
      );
    case 'crm':
    case 'vendido':
    case 'sem_interesse': {
      const status = contact ? STATUS_LABEL[contact.status] : null;
      const body = status ? <Status tone={status.tone}>{status.label}</Status> : <span className="text-muted-foreground">{STAGE_LABEL[lead.stage]}</span>;
      return <LinkCard lead={lead} href={contact ? `/painel/crm?contato=${contact.id}` : '/painel/crm'}>{body}</LinkCard>;
    }
    default:
      return <LinkCard lead={lead} href={href} active={active}><span className="text-muted-foreground">{lead.exit_reason ?? STAGE_LABEL[lead.stage]}</span></LinkCard>;
  }
}
