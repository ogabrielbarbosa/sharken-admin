'use client';

import { canSetStatus, type Contact, type ContactStatus } from '@lps/domain';
import { ShieldAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { markReadAction, retryMessageAction, sendMessageAction, setStatusAction, suggestReplyAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';
import { STATUS_LABEL } from '@/lib/crm';
import { Composer, type Template } from './composer';
import { Thread, type LegacyLine, type ThreadMessage } from './thread';

const MANUAL_STATUSES: ContactStatus[] = ['novo', 'contatado', 'follow_up', 'em_conversa', 'perdido', 'nao_contatar'];

export type ConversationProps = {
  contact: Contact;
  messages: ThreadMessage[];
  legacy: LegacyLine[];
  pageOpens: number;
  expiresIn: string | null;
  now: Date;
  draft: string;
  templates: Template[];
  blockReason: string | null;
  stopRequest: boolean;
  dailyCount: number;
  dailyLimit: number;
};

export function Conversation({ contact, messages, legacy, pageOpens, expiresIn, now, draft, templates, blockReason, stopRequest, dailyCount, dailyLimit }: ConversationProps) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // O servidor traz a mensagem real: o balão local sai assim que o clientMessageId aparece.
  const serverIds = useMemo(() => new Set(messages.map((m) => m.client_message_id).filter(Boolean)), [messages]);
  useEffect(() => {
    setOptimistic((list) => (list.some((m) => serverIds.has(m.client_message_id)) ? list.filter((m) => !serverIds.has(m.client_message_id)) : list));
  }, [serverIds]);
  const shown = useMemo(() => [...messages, ...optimistic.filter((m) => !serverIds.has(m.client_message_id))], [messages, optimistic, serverIds]);

  // Marca como lida ao abrir e a cada mensagem nova com a conversa aberta.
  useEffect(() => {
    if (!contact.unread_count) return;
    const timer = setTimeout(() => { void markReadAction(contact.id).then(() => router.refresh()); }, 700);
    return () => clearTimeout(timer);
  }, [contact.id, contact.unread_count, router]);

  async function send(text: string, clientMessageId: string): Promise<null> {
    setError(null);
    const local: ThreadMessage = {
      id: `local-${clientMessageId}`, created_at: new Date().toISOString(), contact_id: contact.id, direction: 'saida', sent_from: 'painel', kind: 'texto', body: text,
      media_path: null, media_mime: null, status: 'pendente', error: null, external_id: null, client_message_id: clientMessageId, is_first_contact: false, is_follow_up: false, at: new Date().toISOString(),
    };
    setOptimistic((list) => [...list, local]);
    const out = await sendMessageAction(contact.id, text, clientMessageId);
    if (!out.ok) setOptimistic((list) => list.map((m) => (m.client_message_id === clientMessageId ? { ...m, status: 'erro', error: out.error } : m)));
    return null;
  }

  async function retry(m: ThreadMessage) {
    setError(null);
    if (m.id.startsWith('local-')) {
      setOptimistic((list) => list.filter((x) => x.id !== m.id));
      await send(m.body ?? '', crypto.randomUUID());
      return;
    }
    const out = await retryMessageAction(m.id, crypto.randomUUID());
    if (!out.ok) setError(out.error);
  }

  async function changeStatus(to: ContactStatus) {
    if (to === 'nao_contatar' && !window.confirm('Marcar como Não contatar? Isso é permanente e bloqueia o envio para este número.')) return;
    const out = await setStatusAction(contact.id, to);
    if (!out.ok) setError(out.error);
  }

  const options = MANUAL_STATUSES.filter((s) => s === contact.status || canSetStatus(contact.status, s));

  return (
    <section aria-label="Conversa" className="flex min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-9 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-emerald-300" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            <p className="truncate text-xs text-muted-foreground">{contact.phone_e164}</p>
          </div>
        </div>
        <select
          aria-label="Status"
          value={contact.status}
          disabled={contact.status === 'nao_contatar' || contact.status === 'fechado'}
          onChange={(e) => void changeStatus(e.target.value as ContactStatus)}
          className="h-8 cursor-pointer rounded-md border border-input bg-input-bg px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-card"
        >
          {contact.status === 'fechado' && <option value="fechado">{STATUS_LABEL.fechado.label}</option>}
          {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
        </select>
      </header>

      {stopRequest && !dismissed && contact.status !== 'nao_contatar' && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-border bg-warning-subtle px-4 py-2 text-sm">
          <span className="flex items-center gap-2"><ShieldAlert className="size-4 text-warning" />Marcar como Não contatar?</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void changeStatus('nao_contatar')}>Sim, marcar</Button>
            <button type="button" aria-label="Fechar aviso" onClick={() => setDismissed(true)} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </span>
        </div>
      )}
      {error && <div className="px-4 pt-3"><ErrorNote>{error}</ErrorNote></div>}

      <Thread messages={shown} legacy={legacy} pageOpens={pageOpens} expiresIn={expiresIn} now={now} onRetry={(m) => void retry(m)} />

      <Composer
        key={contact.id}
        initialText={draft}
        blockReason={blockReason}
        templates={templates}
        firstContact={contact.status === 'novo'}
        dailyCount={dailyCount}
        dailyLimit={dailyLimit}
        onSend={send}
        onSuggest={() => suggestReplyAction(contact.id)}
      />
    </section>
  );
}
