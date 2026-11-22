'use client';

import type { BatchSource } from '@lps/domain';
import { Loader2, MoreHorizontal, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteBatchAction } from '@/app/painel/batches/[id]/actions';
import { runSourceAction } from '@/app/painel/batches/actions';
import { Button, ErrorNote } from '@/components/ui';

const SOURCE_LABEL: Record<BatchSource, string> = { instagram: 'Instagram', maps: 'Google Maps' };

/**
 * Três pontinhos ao lado do nome do batch: buscar na outra fonte (cruza com os leads do batch) e deletar,
 * com confirmação. `sources` vazio enquanto uma busca está rodando.
 */
export function BatchMenu({ batchId, label, sources = [] }: { batchId: string; label: string; sources?: BatchSource[] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal?.();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  const close = () => { if (!pending) { setConfirming(false); setError(null); } };
  const run = (source: BatchSource) => startTransition(async () => {
    setOpen(false);
    const result = await runSourceAction(batchId, source);
    setError(result.error ?? null);
  });
  const confirm = () => startTransition(async () => {
    setError(null);
    // Quando dá certo, a ação redireciona para a lista de batches.
    const result = await deleteBatchAction(batchId);
    if (result?.error) setError(result.error);
  });

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Ações do batch"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`press flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground ${open ? 'bg-white/5 text-foreground' : ''}`}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-56 origin-top-left animate-pop-in rounded-md border border-border bg-card p-1 shadow-overlay">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => run(s)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5"
            >
              <Search className="size-3.5" />
              Buscar também no {SOURCE_LABEL[s]}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); setConfirming(true); }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive-subtle"
          >
            <Trash2 className="size-3.5" />
            Deletar
          </button>
        </div>
      )}

      {error && !confirming && <p role="alert" className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md bg-destructive-subtle px-2 py-1.5 text-xs text-destructive">{error}</p>}
      {pending && !confirming && <Loader2 className="absolute -right-5 top-1.5 size-4 animate-spin text-muted-foreground" />}

      <dialog
        ref={dialogRef}
        aria-label="Deletar batch"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
      >
        {confirming && (
          <div className="flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-lg font-semibold">Deletar batch?</h2>
              <p className="mt-1 text-sm font-medium">{label}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              O batch e os leads dele somem do quadro. Leads que já têm conversa no CRM ou viraram cliente continuam lá. Não dá para desfazer.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={pending}>Cancelar</Button>
              <Button variant="danger" onClick={confirm} disabled={pending} className="border border-destructive/30">
                {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Deletar batch
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
