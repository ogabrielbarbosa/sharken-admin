'use client';

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createContactAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote, Field, Input } from '@/components/ui';

export function NewContactDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const out = await createContactAction(name, phone);
      if (!out.ok) return setError(out.error);
      setOpen(false);
      setName('');
      setPhone('');
      router.push(`/painel/crm?caixa=novos&contato=${out.contactId}`);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-3.5" />Novo contato</button>
      {open && (
        <div role="dialog" aria-label="Novo contato" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-card border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Novo contato</h2>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <Field label="Telefone" hint="Celular com DDD."><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(19) 99999-9999" /></Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={pending || !name.trim() || !phone.trim()}>{pending ? 'Criando…' : 'Criar contato'}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
