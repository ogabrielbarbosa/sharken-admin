'use client';

import { Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteBatchAction } from '@/app/painel/batches/[id]/actions';
import { Button, ErrorNote } from '@/components/ui';

/** Três pontinhos ao lado do nome do batch. Por ora, só Deletar, com confirmação. */
export function BatchMenu({ batchId, label }: { batchId: string; label: string }) {
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
        <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-40 origin-top-left animate-pop-in rounded-md border border-border bg-card p-1 shadow-overlay">
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
