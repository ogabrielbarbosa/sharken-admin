'use client';

import { RefreshCw } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { Button, Textarea } from '@/components/ui';
import { redoMaterialAction } from '@/app/painel/batches/[id]/material/actions';

/** Refazer a página com uma instrução. O agente recebe o texto e gera de novo. */
export function RedoDialog({ leadId, name }: { leadId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await redoMaterialAction(leadId, text);
      if (res.error) setError(res.error);
      else dialog.current?.close();
    });

  return (
    <>
      <Button variant="outline" onClick={() => dialog.current?.showModal()}><RefreshCw />Refazer…</Button>
      <dialog ref={dialog} className="m-auto w-full max-w-md rounded-lg border border-input bg-card p-5 text-foreground backdrop:bg-black/60" onClose={() => setError(null)}>
        <h3 className="text-base font-medium">Refazer a página de {name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Diga o que deve mudar. O agente monta a página de novo com essa instrução.</p>
        <div className="mt-3">
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: destaque o horário de funcionamento e use um tom mais direto." autoFocus />
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => dialog.current?.close()}>Cancelar</Button>
          <Button disabled={pending || !text.trim()} onClick={submit}>{pending ? 'Enviando…' : 'Refazer página'}</Button>
        </div>
      </dialog>
    </>
  );
}
