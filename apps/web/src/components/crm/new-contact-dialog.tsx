'use client';

import { Loader2, MessageSquarePlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { createContactAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';

/** Máscara de celular brasileiro: (19) 99999-9999. */
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function NewContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const out = await createContactAction(name, phone);
      if (!out.ok) return setError(out.error);
      close();
      setName('');
      setPhone('');
      router.push(`/painel/crm?aba=aberto&contato=${out.contactId}`);
    });
  }

  const digits = phone.replace(/\D/g, '');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Nova conversa"
        aria-label="Nova conversa"
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MessageSquarePlus className="size-5" />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="novo-contato-titulo" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Fechar" onClick={close} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
          <form onSubmit={submit} className="relative w-full max-w-sm overflow-hidden rounded-card border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 id="novo-contato-titulo" className="text-base font-semibold">Nova conversa</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">O contato entra em Abertos, pronto para a primeira mensagem.</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={close} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Nome</span>
                <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Barbearia do Zé" className="h-10 w-full rounded-lg border border-input bg-input-bg px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-neutral-400" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Celular com DDD</span>
                <span className="flex h-10 items-center rounded-lg border border-input bg-input-bg focus-within:border-neutral-400">
                  <span className="border-r border-input px-3 font-mono text-sm text-muted-foreground">+55</span>
                  <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" placeholder="(19) 99999-9999" className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none placeholder:text-muted-foreground" />
                </span>
              </label>
              {error && <ErrorNote>{error}</ErrorNote>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-background/40 px-5 py-3">
              <Button variant="ghost" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={pending || !name.trim() || digits.length < 10}>{pending ? <Loader2 className="animate-spin" /> : null}{pending ? 'Criando…' : 'Criar e abrir'}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
