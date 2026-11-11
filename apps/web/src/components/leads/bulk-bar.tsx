'use client';

import { ArrowRight, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui';

type Action = (form: FormData) => void | Promise<void>;

/** Barra fixa no rodapé com os leads selecionados. */
export function BulkBar({ batchId, ids, advance, discard, onClear }: { batchId: string; ids: string[]; advance: Action; discard: Action; onClear: () => void }) {
  if (ids.length === 0) return null;
  const hidden = (
    <>
      <input type="hidden" name="batchId" value={batchId} />
      {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
    </>
  );
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-xl">
        <span className="text-sm font-medium">{ids.length === 1 ? '1 selecionado' : `${ids.length} selecionados`}</span>
        <button type="button" onClick={onClear} aria-label="Limpar seleção" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        <form action={discard}>
          {hidden}
          <Button type="submit" variant="outline"><Trash2 />Descartar</Button>
        </form>
        <form action={advance}>
          {hidden}
          <Button type="submit"><ArrowRight />Avançar {ids.length} e completar</Button>
        </form>
      </div>
    </div>
  );
}
