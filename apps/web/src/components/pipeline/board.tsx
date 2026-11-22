'use client';

import type { PipelineResult } from '@lps/db';
import { columnOf, dropMove, PIPELINE_COLUMNS, type Lead, type PipelineColumn } from '@lps/domain';
import { useRouter } from 'next/navigation';
import { completeInfoAction, discardAction, qualifyAction, stepBackAction } from '@/app/painel/batches/[id]/actions';
import { useState, useTransition } from 'react';
import { boardHref } from '@/lib/board-href';
import { Column } from './column';
import { LeadCard, type CardContact } from './lead-card';

const EMPTY: Partial<Record<PipelineColumn, string>> = {
  novo: 'Nenhum lead aqui.',
  qualificado: 'Qualifique leads em Novo lead.',
  pagina: 'Nenhum lead esperando página.',
  video: 'Nenhum lead esperando o Loom.',
  pronto: 'Nenhum lead pronto ainda.',
};

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
export function Board({ batchId, leads, contacts, query = '', openId, known = {} }: {
  batchId: string; leads: Lead[]; contacts: Record<string, CardContact[]>; query?: string; openId?: string;
  /** Leads que já eram conhecidos, com os batches anteriores. */
  known?: Record<string, string[]>;
}) {
  const [tab, setTab] = useState<PipelineColumn>('novo');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const router = useRouter();
  const { notice, run } = useStageAction();
  // Cartão sendo arrastado: as colunas uma etapa antes ou depois aceitam o cartão, e Descartados vira lixeira.
  const [dragging, setDragging] = useState<Lead | null>(null);

  const dropOn = (column: PipelineColumn) => {
    const lead = dragging;
    const move = lead && dropMove(lead.stage, column);
    if (!lead || !move) return undefined;
    return () => {
      setDragging(null);
      if (move === 'qualificar') run(() => qualifyAction([lead.id]));
      else if (move === 'completar') run(() => completeInfoAction(lead.id));
      else if (move === 'voltar') run(() => stepBackAction(lead.id, lead.stage as 'pagina' | 'video'));
      else if (move === 'descartar') run(() => discardAction([lead.id]));
      // Página → Vídeo e Vídeo → Pronto pedem um link: abre o modal do lead.
      else router.push(boardHref(batchId, query, lead.id), { scroll: false });
    };
  };

  const byColumn = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, [] as Lead[]])) as Record<PipelineColumn, Lead[]>;
  for (const lead of leads) byColumn[columnOf(lead.stage)].push(lead);

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
      <div className="flex flex-col gap-4 md:min-h-96 md:flex-1 md:flex-row md:gap-3 md:overflow-x-auto md:pb-2">
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
              trash={discarded ? { armed: !!dragging, onDrop: dropOn('descartados') ?? (() => setDragging(null)) } : undefined}
              target={!discarded && dropOn(c.key) ? { onDrop: dropOn(c.key)! } : undefined}
            >
              {list.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  href={boardHref(batchId, query, lead.id)}
                  active={lead.id === openId}
                  contacts={contacts[lead.id]}
                  knownFrom={known[lead.id]}
                  drag={PIPELINE_COLUMNS.some((col) => dropMove(lead.stage, col.key)) ? { onStart: () => setDragging(lead), onEnd: () => setDragging(null) } : undefined}
                />
              ))}
            </Column>
          );
        })}
      </div>
    </>
  );
}
