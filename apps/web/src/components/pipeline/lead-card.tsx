import type { ChatState, ContactStatus, Lead, LeadAsset } from '@lps/domain';
import { Loader2, MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Status } from '@/components/ui';
import { crmHref, STATUS_LABEL } from '@/lib/crm';
import { leadMeta, siteLabel } from '@/lib/lead-labels';

export type CardContact = { id: string; status: ContactStatus; chat_state?: ChatState };

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

export type CardDrag = { onStart: () => void; onEnd: () => void };

/** `drag`: o cartão pode ser arrastado (até Descartados). */
function Shell({ lead, active, drag, children }: { lead: Lead; active?: boolean; drag?: CardDrag; children: ReactNode }) {
  return (
    <li
      data-testid={`card-${lead.id}`}
      draggable={!!drag}
      onDragStart={drag && ((e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; drag.onStart(); })}
      onDragEnd={drag?.onEnd}
      className={`rounded-md border bg-card p-3 text-sm ${drag ? 'cursor-grab active:cursor-grabbing' : ''} ${active ? 'border-neutral-400' : 'border-border'}`}
    >
      {children}
    </li>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 70 ? 'border-success text-success' : score >= 50 ? 'border-warning text-warning' : 'border-destructive text-destructive';
  return <span aria-label={`Pontuação ${score}`} title="Pontuação" className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums ${tone}`}>{score}</span>;
}

/** Mesmo formato em todas as colunas: nome, bolinha com a pontuação, status do site e o que falta na etapa. */
function CardBody({ lead, children }: { lead: Lead; children?: ReactNode }) {
  const site = siteLabel(lead);
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{lead.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{leadMeta(lead)}</span>
        </span>
        {lead.score != null && <ScoreBadge score={lead.score} />}
      </span>
      <span className="mt-2 block text-xs"><Status tone={site.tone}>{site.label}</Status></span>
      {children && <span className="mt-1.5 block text-xs">{children}</span>}
    </>
  );
}

/** Cartão inteiro clicável: clicar abre o lead (ou a conversa). */
function LinkCard({ lead, href, active, drag, children }: { lead: Lead; href: string; active?: boolean; drag?: CardDrag; children?: ReactNode }) {
  return (
    <Shell lead={lead} active={active} drag={drag}>
      <Link href={href} scroll={false} draggable={false} className="-m-3 block rounded-md p-3 hover:bg-accent/40">
        <CardBody lead={lead}>{children}</CardBody>
      </Link>
    </Shell>
  );
}

export function LeadCard({ lead, href, active, assets, contacts, drag }: {
  lead: Lead; href: string; active?: boolean; assets?: LeadAsset[]; contacts?: CardContact[]; drag?: CardDrag;
}) {
  switch (lead.stage) {
    case 'analisando':
      return (
        <Shell lead={lead} drag={drag}>
          <CardBody lead={lead}>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3 animate-spin" />Analisando…</span>
          </CardBody>
        </Shell>
      );
    case 'revisar':
      return <LinkCard lead={lead} href={href} active={active} drag={drag} />;
    case 'completar': {
      const { text, extracting } = assetSummary(assets ?? []);
      return (
        <LinkCard lead={lead} href={href} active={active} drag={drag}>
          <span className="block text-muted-foreground">{text}</span>
          {extracting > 0 && <span className="mt-1 inline-flex items-center gap-1 text-warning"><Loader2 className="size-3 animate-spin" />{extracting} em extração</span>}
        </LinkCard>
      );
    }
    case 'pagina':
      return <LinkCard lead={lead} href={href} active={active} drag={drag}><span className="text-warning">Falta a página</span></LinkCard>;
    case 'video':
      return (
        <LinkCard lead={lead} href={href} active={active} drag={drag}>
          {lead.page_url && <span className="block text-muted-foreground">{domainOf(lead.page_url)}</span>}
          <span className="block text-warning">{lead.loom_url ? 'Loom salvo, falta levar ao CRM' : 'Falta o Loom'}</span>
        </LinkCard>
      );
    case 'crm':
    case 'vendido':
    case 'sem_interesse': {
      // Um contato só: abre a conversa direto. Vários (ou nenhum): abre a lista de conversas do lead.
      const list = contacts ?? [];
      const status = list[0] ? STATUS_LABEL[list[0].status] : null;
      const target = list.length === 1 ? crmHref(list[0].chat_state ?? 'aberto', { contato: list[0].id }) : href;
      return (
        <LinkCard lead={lead} href={target} active={active} drag={drag}>
          <span className="flex flex-wrap items-center gap-2">
            {status ? <Status tone={status.tone}>{status.label}</Status> : <span className="text-muted-foreground">{STAGE_LABEL[lead.stage]}</span>}
            {list.length > 1 && <span className="inline-flex items-center gap-1 text-muted-foreground"><MessagesSquare className="size-3" />{plural(list.length, 'conversa', 'conversas')}</span>}
          </span>
        </LinkCard>
      );
    }
    default:
      return <LinkCard lead={lead} href={href} active={active} drag={drag}><span className="text-muted-foreground">{lead.exit_reason ?? STAGE_LABEL[lead.stage]}</span></LinkCard>;
  }
}
