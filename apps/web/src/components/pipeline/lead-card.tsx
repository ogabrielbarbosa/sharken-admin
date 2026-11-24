import type { ChatState, ContactStatus, Lead } from '@lps/domain';
import { History, Loader2, MessagesSquare } from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { QuickLinks } from '@/components/leads/quick-links';
import { Status } from '@/components/ui';
import type { Member } from '@/lib/members';
import { crmHref, STATUS_LABEL } from '@/lib/crm';
import { leadMeta, siteLabel } from '@/lib/lead-labels';
import { ResponsiblePicker } from './responsible-picker';

export type CardContact = { id: string; status: ContactStatus; chat_state?: ChatState };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const STAGE_LABEL: Partial<Record<Lead['stage'], string>> = { crm: 'No CRM', vendido: 'Vendido', sem_interesse: 'Sem interesse', nao_contatar: 'Não contatar', descartado: 'Descartado' };

export type CardDrag = { onStart: () => void; onEnd: () => void };

/** Batches anteriores em que o lead já tinha aparecido (só nos leads já conhecidos deste batch). */
const KnownFrom = createContext<string[] | undefined>(undefined);

/** Membros e troca do responsável, vindos do quadro. */
export const ResponsibleContext = createContext<{ members: Member[]; pending: boolean; assign: (leadId: string, userId: string | null) => void }>({ members: [], pending: false, assign: () => {} });

/** `drag`: o cartão pode ser arrastado (até Descartados). */
function Shell({ lead, active, drag, children }: { lead: Lead; active?: boolean; drag?: CardDrag; children: ReactNode }) {
  return (
    <li
      data-testid={`card-${lead.id}`}
      draggable={!!drag}
      onDragStart={drag && ((e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; drag.onStart(); })}
      onDragEnd={drag?.onEnd}
      className={`relative rounded-md border bg-card p-3 pb-3.5 text-sm ${drag ? 'cursor-grab active:cursor-grabbing' : ''} ${active ? 'border-neutral-400' : 'border-border'}`}
    >
      {children}
      {lead.score != null && <ScoreBar score={lead.score} />}
    </li>
  );
}

/** Pontuação em barra, de ponta a ponta na base do cartão. */
function ScoreBar({ score }: { score: number }) {
  const value = Math.min(100, Math.max(0, score));
  const tone = value >= 70 ? 'bg-success' : value >= 50 ? 'bg-warning' : 'bg-destructive';
  return (
    <span role="meter" aria-label={`Pontuação ${score}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-[5px] bg-white/5">
      <span className={`block h-full ${tone}`} style={{ width: `${value}%` }} />
    </span>
  );
}

function Responsible({ lead }: { lead: Lead }) {
  const { members, pending, assign } = useContext(ResponsibleContext);
  return <ResponsiblePicker leadName={lead.name} value={lead.responsible_id ?? null} members={members} disabled={pending} onChange={(id) => assign(lead.id, id)} />;
}

/** Mesmo formato em todas as colunas: nome, responsável, status do site, atalhos e o que falta na etapa. */
function CardBody({ lead, children }: { lead: Lead; children?: ReactNode }) {
  const site = siteLabel(lead);
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{lead.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{leadMeta(lead)}</span>
        </span>
        <Responsible lead={lead} />
      </span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0"><Status tone={site.tone}>{site.label}</Status></span>
        <QuickLinks lead={lead} />
      </span>
      {children && <span className="mt-1.5 block text-xs">{children}</span>}
      <Known />
    </>
  );
}

function Known() {
  const from = useContext(KnownFrom);
  if (!from) return null;
  return (
    <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground" data-tip={from.join('\n')}>
      <History className="size-3 shrink-0" />
      <span className="truncate">Já conhecido{from.length ? ` · ${from[0]}${from.length > 1 ? ` e mais ${from.length - 1}` : ''}` : ''}</span>
    </span>
  );
}

/** Enquanto o lead clicado carrega, um brilho passa pelo cartão (com atraso, para não piscar nos rápidos). */
function Pending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md bg-[linear-gradient(90deg,transparent_30%,#ffffff12_50%,transparent_70%)] bg-[length:200%_100%] [animation:var(--animate-fade-in),var(--animate-shimmer)] [animation-delay:100ms,0ms]" />;
}

/**
 * Cartão inteiro clicável: clicar abre o lead (ou a conversa). O link cobre o cartão por baixo do conteúdo
 * (não dá para pôr os atalhos de Instagram/Maps/site dentro de outro link), e só os atalhos recebem clique.
 */
function LinkCard({ lead, href, active, drag, children }: { lead: Lead; href: string; active?: boolean; drag?: CardDrag; children?: ReactNode }) {
  return (
    <Shell lead={lead} active={active} drag={drag}>
      <Link href={href} scroll={false} draggable={false} aria-label={lead.name} className="absolute inset-0 rounded-md hover:bg-accent/40">
        <Pending />
      </Link>
      <span className="pointer-events-none relative block">
        <CardBody lead={lead}>{children}</CardBody>
      </span>
    </Shell>
  );
}

export function LeadCard({ knownFrom, ...props }: {
  lead: Lead; href: string; active?: boolean; contacts?: CardContact[]; drag?: CardDrag; knownFrom?: string[];
}) {
  return <KnownFrom.Provider value={knownFrom}><StageCard {...props} /></KnownFrom.Provider>;
}

function StageCard({ lead, href, active, contacts, drag }: {
  lead: Lead; href: string; active?: boolean; contacts?: CardContact[]; drag?: CardDrag;
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
    case 'completar':
    case 'pagina':
    case 'video':
      return <LinkCard lead={lead} href={href} active={active} drag={drag} />;
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
