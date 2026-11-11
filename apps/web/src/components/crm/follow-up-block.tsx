'use client';

import { Bell, Plus, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { saveFollowUpAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';
import { Section } from './panel-parts';

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '');
const brDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function FollowUpBlock({ contactId, at, note, disabled }: { contactId: string; at: string | null; note: string | null; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(dateOnly(at));
  const [text, setText] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(nextDate: string | null) {
    setError(null);
    start(async () => {
      // 12h em Brasília: o dia escolhido não muda de lado em nenhum fuso.
      const out = await saveFollowUpAction(contactId, nextDate ? `${nextDate}T12:00:00-03:00` : null, text);
      if (out.ok) setEditing(false);
      else setError(out.error);
    });
  }

  return (
    <Section icon={<Bell />} title="Follow-up">
      {editing ? (
        <div className="space-y-2">
          <input type="date" aria-label="Data do follow-up" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-full rounded-md border border-input bg-input-bg px-2 text-sm outline-none" />
          <input aria-label="Anotação do follow-up" value={text} onChange={(e) => setText(e.target.value)} placeholder="Anotação (opcional)" className="h-8 w-full rounded-md border border-input bg-input-bg px-2 text-sm outline-none placeholder:text-muted-foreground" />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <Button disabled={pending || !date} onClick={() => save(date)}>Salvar</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      ) : at ? (
        <div className="flex items-start justify-between gap-2 text-sm">
          <div className="min-w-0">
            <p>{brDate(at)}</p>
            {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
          </div>
          <span className="flex shrink-0 gap-2 text-xs">
            <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="cursor-pointer hover:underline disabled:opacity-50">Editar</button>
            <button type="button" aria-label="Remover follow-up" disabled={pending} onClick={() => { setDate(''); setText(''); save(null); }} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </span>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sem follow-up agendado</span>
          <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="inline-flex cursor-pointer items-center gap-1 font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50">Agendar <Plus className="size-4" /></button>
        </div>
      )}
    </Section>
  );
}
