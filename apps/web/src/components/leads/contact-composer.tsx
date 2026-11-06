'use client';

import { buildWhatsAppLink, type ContactKind } from '@lps/domain';
import { Check, MessageCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { confirmSentAction, recordOpenedAction } from '@/app/painel/batches/[id]/contact-actions';
import { Button, ErrorNote, Textarea } from '@/components/ui';

export function ContactComposer({ leadId, phone, initial, kind, label }: { leadId: string; phone: string; initial: string; kind: ContactKind; label: string }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, start] = useTransition();

  function open() {
    // A janela precisa abrir no mesmo clique, ou o navegador a bloqueia.
    window.open(buildWhatsAppLink(phone, text), '_blank', 'noopener');
    setOpened(true);
    start(async () => {
      const out = await recordOpenedAction(leadId, kind);
      setError(out.error ?? null);
    });
  }

  function confirm() {
    start(async () => {
      const out = await confirmSentAction(leadId, kind, text);
      setError(out.error ?? null);
    });
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">{label}</span>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <p className="text-xs text-muted-foreground">1. Abra no WhatsApp e envie a mensagem. 2. Volte aqui e confirme o envio.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={open} disabled={!text.trim() || pending}><MessageCircle />Abrir no WhatsApp</Button>
        <Button onClick={confirm} disabled={!opened || pending}><Check />Confirmar envio</Button>
      </div>
    </div>
  );
}
