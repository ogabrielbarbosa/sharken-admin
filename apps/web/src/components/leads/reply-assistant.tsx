'use client';

import { Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { suggestReplyAction } from '@/app/painel/batches/[id]/conversa/actions';
import { Button, ErrorNote, Textarea } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';

export function ReplyAssistant({ leadId, initialIncoming }: { leadId: string; initialIncoming: string }) {
  const [incoming, setIncoming] = useState(initialIncoming);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsValue = reply.includes('[valor]');

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">Mensagem recebida (cole aqui)</span>
        <Textarea rows={4} value={incoming} onChange={(e) => setIncoming(e.target.value)} />
      </label>
      <Button
        variant="outline"
        disabled={pending || !incoming.trim()}
        onClick={() => start(async () => {
          const out = await suggestReplyAction(leadId, incoming);
          setError(out.error ?? null);
          if (out.text) setReply(out.text);
        })}
      >
        <Sparkles />{pending ? 'Gerando…' : 'Sugerir resposta'}
      </Button>
      {error && <ErrorNote>{error}</ErrorNote>}
      {reply && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sugestão de resposta</span>
            <CopyButton text={reply} disabled={needsValue} />
          </div>
          <Textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} />
          <p className={`text-xs ${needsValue ? 'text-warning' : 'text-muted-foreground'}`}>
            {needsValue ? 'Preencha o campo [valor] antes de copiar. ' : 'Revise antes de enviar. '}Você copia o texto e envia pelo WhatsApp.
          </p>
        </div>
      )}
    </div>
  );
}
