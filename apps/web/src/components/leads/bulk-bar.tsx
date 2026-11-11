'use client';

import { Check, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';

/** Barra fixa no rodapé com os leads selecionados. */
export function BulkBar({ ids, onQualify, onDiscard, onClear, pending }: { ids: string[]; onQualify: () => void; onDiscard: () => void; onClear: () => void; pending?: boolean }) {
  if (ids.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xl">
        <span className="text-sm font-medium">{ids.length === 1 ? '1 selecionado' : `${ids.length} selecionados`}</span>
        <button type="button" onClick={onClear} aria-label="Limpar seleção" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        <Button variant="ghost" disabled={pending} onClick={onDiscard}><Trash2 />Descartar</Button>
        <Button disabled={pending} onClick={onQualify}><Check />Qualificar</Button>
      </div>
    </div>
  );
}
