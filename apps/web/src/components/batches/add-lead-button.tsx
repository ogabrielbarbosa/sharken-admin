'use client';

import { Loader2, Plus } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { addManualLeadAction } from '@/app/painel/batches/[id]/actions';
import { Button, ErrorNote, Field, Input, Textarea } from '@/components/ui';

/** Batch manual: cadastra um lead à mão. Ao salvar, ele entra na análise. */
export function AddLeadButton({ batchId, businessType }: { batchId: string; businessType: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const show = () => { setError(null); setNotice(null); setOpen(true); dialogRef.current?.showModal(); };
  const close = () => { if (!pending) { setOpen(false); dialogRef.current?.close(); } };
  const submit = (form: FormData) => start(async () => {
    setError(null);
    const result = await addManualLeadAction(batchId, form);
    if (result.error) return setError(result.error);
    if (result.notice) return setNotice(result.notice);
    setOpen(false);
    dialogRef.current?.close();
  });

  return (
    <>
      <Button onClick={show}><Plus /><span className="max-sm:sr-only">Adicionar lead</span></Button>
      <dialog
        ref={dialogRef}
        aria-label="Adicionar lead"
        onCancel={(e) => { e.preventDefault(); close(); }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-black/60"
      >
        {open && (
          // onSubmit (e não action) para não limpar os campos quando volta um erro.
          <form className="flex flex-col gap-4 p-6" onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
            <div>
              <h2 className="text-lg font-semibold">Adicionar lead</h2>
              <p className="mt-1 text-sm text-muted-foreground">Só o nome é obrigatório. Quanto mais você preencher, melhor a análise.</p>
            </div>
            {notice ? <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">{notice}</p> : (
              <>
                <Field label="Nome do negócio"><Input name="name" required autoFocus /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo de negócio"><Input name="businessType" defaultValue={businessType} /></Field>
                  <Field label="Celular / WhatsApp"><Input name="phone" inputMode="tel" placeholder="(12) 99999-9999" /></Field>
                  <Field label="Instagram"><Input name="instagram" placeholder="@perfil ou link" /></Field>
                  <Field label="Site"><Input name="website" inputMode="url" placeholder="Vazio se não tem" /></Field>
                  <Field label="E-mail"><Input name="email" inputMode="email" /></Field>
                  <Field label="Cidade"><Input name="city" /></Field>
                </div>
                <Field label="Endereço"><Input name="address" /></Field>
                <Field label="Sobre o negócio" hint="Serviços, diferenciais, público. Entra na análise."><Textarea name="description" rows={4} /></Field>
              </>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>{notice ? 'Fechar' : 'Cancelar'}</Button>
              {!notice && <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}Adicionar e analisar</Button>}
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
