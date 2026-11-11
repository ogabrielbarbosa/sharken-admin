'use client';

import { Loader2, Sparkles, SkipForward, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { discardLeadAction } from '@/lib/common-lead-actions';
import { generateMaterialAction, skipAction } from '@/app/painel/batches/[id]/completar/actions';

/** Rodapé da tela: aviso de extração, Descartar, Pular e Gerar material e próximo. */
export function GenerateBar({ leadId, batchId, ids, hint, canSkip }: { leadId: string; batchId: string; ids: string[]; hint: string | null; canSkip: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const csv = ids.join(',');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {error ? <span className="text-destructive">{error}</span> : hint && <><Loader2 className="size-3.5 animate-spin text-warning" />{hint}</>}
      </p>
      <div className="flex items-center gap-2">
        <form action={discardLeadAction}>
          <input type="hidden" name="leadId" value={leadId} />
          <Button type="submit" variant="ghost"><Trash2 />Descartar</Button>
        </form>
        {canSkip && (
          <form action={skipAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="ids" value={csv} />
            <Button type="submit" variant="outline"><SkipForward />Pular</Button>
          </form>
        )}
        <Button
          type="button"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await generateMaterialAction(leadId, batchId, ids);
            if (res?.error) setError(res.error);
          })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}Gerar material e próximo
        </Button>
      </div>
    </div>
  );
}
