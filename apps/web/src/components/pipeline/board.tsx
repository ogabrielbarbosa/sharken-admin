'use client';

import type { PipelineResult } from '@lps/db';
import { columnOf, PIPELINE_COLUMNS, type Lead, type LeadAsset, type PipelineColumn } from '@lps/domain';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BulkBar } from '@/components/leads/bulk-bar';
import { discardAction, qualifyAction } from '@/app/painel/batches/[id]/actions';
import { Column } from './column';
import { LeadCard, type CardContact } from './lead-card';

const EMPTY: Partial<Record<PipelineColumn, string>> = {
  novo: 'Nenhum lead aqui.',
  qualificado: 'Qualifique leads em Novo lead.',
  pagina: 'Nenhum lead esperando página.',
  video: 'Nenhum lead esperando o Loom.',
  pronto: 'Nenhum lead pronto ainda.',
};

/** Link do lead dentro do quadro: mantém os filtros e abre o modal em `?lead=`. */
export function boardHref(batchId: string, query: string, leadId: string | null): string {
  const qs = new URLSearchParams(query);
  if (leadId) qs.set('lead', leadId);
  const text = qs.toString();
  return `/painel/batches/${batchId}${text ? `?${text}` : ''}`;
}

/** Mesmo texto de `STALE` em `@lps/db` (o teste confere); o pacote do banco não entra no cliente. */
export const STALE_NOTICE = 'Este lead já mudou de etapa.';

/** `href` com um aviso para o quadro mostrar depois que o modal fecha. */
export function withNotice(href: string, text: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}aviso=${encodeURIComponent(text)}`;
}

/**
 * Roda uma ação de etapa e guarda o aviso. Com `closeHref` (modais), um lead que já mudou de etapa
 * fecha o modal e leva o aviso ao quadro pela URL, porque o modal pode ser trocado por outro na recarga.
 */
export function useStageAction(closeHref?: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const run = (fn: () => Promise<PipelineResult>, after?: (r: PipelineResult) => void) =>
    start(async () => {
      const result = await fn();
      if (!result.ok && result.error === STALE_NOTICE && closeHref) {
        router.replace(withNotice(closeHref, STALE_NOTICE), { scroll: false });
        return;
      }
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error });
        router.refresh();
      } else {
        setNotice(result.warning ? { tone: 'warning', text: result.warning } : null);
      }
      after?.(result);
    });
  return { pending, notice, run, clear: () => setNotice(null) };
}

export function Notice({ notice }: { notice: { tone: 'error' | 'warning'; text: string } | null }) {
  if (!notice) return null;
  const cls = notice.tone === 'error' ? 'bg-destructive-subtle text-destructive' : 'bg-warning-subtle text-warning';
  return <p role="status" className={`rounded-md px-3 py-2 text-sm ${cls}`}>{notice.text}</p>;
}

/**
 * Quadro da pipeline. Recebe os leads já na ordem de cada coluna
 * (Novo lead filtrado e por pontuação, as outras por tempo na etapa).
 */
export function Board({ batchId, leads, assets, contacts, query = '', openId }: {
  batchId: string; leads: Lead[]; assets: Record<string, LeadAsset[]>; contacts: Record<string, CardContact>; query?: string; openId?: string;
}) {
  const [tab, setTab] = useState<PipelineColumn>('novo');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pending, notice, run } = useStageAction();

  const byColumn = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, [] as Lead[]])) as Record<PipelineColumn, Lead[]>;
  for (const lead of leads) byColumn[columnOf(lead.stage)].push(lead);

  // Só os visíveis e ainda em Revisar, na ordem do quadro.
  const selectable = byColumn.novo.filter((l) => l.stage === 'revisar');
  const ids = selectable.filter((l) => selected.has(l.id)).map((l) => l.id);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));
  const act = (fn: (ids: string[]) => Promise<PipelineResult>, targets: string[]) =>
    run(() => fn(targets), () => setSelected((s) => { const n = new Set(s); targets.forEach((t) => n.delete(t)); return n; }));

  return (
    <>
      <div role="tablist" aria-label="Etapas" className="mb-3 flex gap-1 overflow-x-auto md:hidden">
        {PIPELINE_COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={tab === c.key}
            onClick={() => setTab(c.key)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm ${tab === c.key ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground'}`}
          >
            {c.label}
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${tab === c.key ? 'bg-neutral-300' : 'bg-secondary text-foreground'}`}>{byColumn[c.key].length}</span>
          </button>
        ))}
      </div>
      {notice && <div className="mb-3"><Notice notice={notice} /></div>}
      {selectable.length > 0 && (
        <label className={`mb-2 items-center gap-2 px-1 text-xs text-muted-foreground ${tab === 'novo' ? 'flex' : 'hidden md:flex'}`}>
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((l) => l.id)))} className="size-4 accent-neutral-200" />
          Selecionar todos em Novo lead
        </label>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-3 md:overflow-x-auto md:pb-2">
        {PIPELINE_COLUMNS.map((c) => {
          const list = byColumn[c.key];
          const discarded = c.key === 'descartados';
          return (
            <Column
              key={c.key}
              label={c.label}
              count={list.length}
              visible={tab === c.key}
              // No celular a aba já é a escolha de ver os descartados.
              collapsed={discarded && !showDiscarded && tab !== 'descartados'}
              onExpand={() => setShowDiscarded(true)}
              onCollapse={discarded ? () => setShowDiscarded(false) : undefined}
              empty={EMPTY[c.key]}
            >
              {list.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  href={boardHref(batchId, query, lead.id)}
                  active={lead.id === openId}
                  assets={assets[lead.id]}
                  contact={contacts[lead.id]}
                  selected={selected.has(lead.id)}
                  onSelect={() => toggle(lead.id)}
                  onQualify={() => act(qualifyAction, [lead.id])}
                  onDiscard={() => act(discardAction, [lead.id])}
                  pending={pending}
                />
              ))}
            </Column>
          );
        })}
      </div>
      <BulkBar ids={ids} pending={pending} onQualify={() => act(qualifyAction, ids)} onDiscard={() => act(discardAction, ids)} onClear={() => setSelected(new Set())} />
    </>
  );
}
