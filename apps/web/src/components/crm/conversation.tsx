'use client';

import { canSetStatus, type ChatState, type Contact, type ContactStatus, type MemberProfile } from '@lps/domain';
import { CheckCircle2, ChevronLeft, Paperclip, RotateCcw, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { attendChatAction, closeChatAction, markReadAction, reopenChatAction, retryMessageAction, saveNoteAction, sendMediaAction, sendMessageAction, setStatusAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';
import { crmHref, STATUS_LABEL } from '@/lib/crm';
import { Avatar } from './avatar';
import { Composer, type QuickReplyItem, type Template, type Variable } from './composer';
import { messageLabel, Thread, type LegacyLine, type ThreadMessage, type ThreadPeople } from './thread';

const MANUAL_STATUSES: ContactStatus[] = ['novo', 'contatado', 'follow_up', 'em_conversa', 'perdido', 'nao_contatar'];

export type ConversationProps = {
  contact: Contact;
  messages: ThreadMessage[];
  legacy: LegacyLine[];
  now: Date;
  draft: string;
  templates: Template[];
  blockReason: string | null;
  backHref: string;
  stopRequest: boolean;
  dailyCount: number;
  dailyLimit: number;
  quickReplies: QuickReplyItem[];
  variables: Variable[];
  me: { userId: string; email: string; name: string; avatar: string | null; phone: string | null; connectionName: string | null };
  /** Perfil de quem enviou mensagens nesta conversa, por usuário. */
  profiles: Record<string, MemberProfile>;
  /** Aba aberta na lista. A aba acompanha o estado do atendimento desta conversa. */
  tab: ChatState;
  /** Com busca a lista mostra todas as abas: não troca de aba. */
  searching: boolean;
};

export function Conversation({ contact, messages, legacy, now, draft, templates, blockReason, backHref, stopRequest, dailyCount, dailyLimit, quickReplies, variables, me, profiles, tab, searching }: ConversationProps) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [dropped, setDropped] = useState<{ file: File; n: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const closed = contact.chat_state === 'fechado';
  const lastInboundId = [...messages].reverse().find((m) => m.direction === 'entrada')?.id ?? null;

  // O servidor traz a mensagem real: o balão local sai assim que o clientMessageId aparece.
  const serverIds = useMemo(() => new Set(messages.map((m) => m.client_message_id).filter(Boolean)), [messages]);
  useEffect(() => {
    setOptimistic((list) => (list.some((m) => serverIds.has(m.client_message_id)) ? list.filter((m) => !serverIds.has(m.client_message_id)) : list));
  }, [serverIds]);
  const shown = useMemo(() => [...messages, ...optimistic.filter((m) => !serverIds.has(m.client_message_id))], [messages, optimistic, serverIds]);

  // Abrir um atendimento pendente é atender: vai para Abertos.
  useEffect(() => {
    if (contact.chat_state !== 'pendente') return;
    let cancelled = false;
    void attendChatAction(contact.id).then((out) => {
      if (!cancelled && out.ok) router.replace(crmHref('aberto', { contato: contact.id }), { scroll: false });
    });
    return () => { cancelled = true; };
  }, [contact.id, contact.chat_state, router]);

  // A aba segue o estado: enviou num fechado (vira aberto), fechou, reabriu, chegou mensagem.
  useEffect(() => {
    if (searching || contact.chat_state === 'pendente' || contact.chat_state === tab) return;
    router.replace(crmHref(contact.chat_state, { contato: contact.id }), { scroll: false });
  }, [contact.id, contact.chat_state, tab, searching, router]);

  async function closeChat() {
    const out = await closeChatAction(contact.id);
    if (!out.ok) return setError(out.error);
    setReplyTo(null);
    router.replace(crmHref('fechado', { contato: contact.id }), { scroll: false });
  }

  async function reopenChat() {
    const out = await reopenChatAction(contact.id);
    if (!out.ok) return setError(out.error);
    router.replace(crmHref('aberto', { contato: contact.id }), { scroll: false });
  }

  // Marca como lida ao abrir e a cada mensagem nova com a conversa aberta.
  useEffect(() => {
    if (!contact.unread_count) return;
    const timer = setTimeout(() => { void markReadAction(contact.id).then(() => router.refresh()); }, 700);
    return () => clearTimeout(timer);
  }, [contact.id, contact.unread_count, router]);

  /** Tira a resposta escolhida da faixa: ela vai junto com este envio. */
  function takeQuote() {
    const q = replyTo;
    setReplyTo(null);
    return { quoted_external_id: q?.external_id ?? null, quoted_preview: q ? messageLabel(q) : null };
  }

  type Quote = ReturnType<typeof takeQuote>;

  /** `again`: reenvio de um balão que falhou, com a citação que ele já tinha. */
  async function send(text: string, clientMessageId: string, again?: Quote): Promise<void> {
    setError(null);
    const quote = again ?? takeQuote();
    const local: ThreadMessage = {
      id: `local-${clientMessageId}`, created_at: new Date().toISOString(), contact_id: contact.id, direction: 'saida', sent_from: 'painel', sent_by: me.userId, sent_by_email: me.email, connection_phone: me.phone, connection_name: me.connectionName, kind: 'texto', body: text,
      media_path: null, media_mime: null, status: 'pendente', error: null, external_id: null, client_message_id: clientMessageId, is_first_contact: false, is_follow_up: false, at: new Date().toISOString(),
      meta: {}, reactions: [], edited_at: null, deleted_at: null, ...quote,
    };
    setOptimistic((list) => [...list, local]);
    const out = await sendMessageAction(contact.id, text, clientMessageId, quote.quoted_external_id);
    if (!out.ok) setOptimistic((list) => list.map((m) => (m.client_message_id === clientMessageId ? { ...m, status: 'erro', error: out.error } : m)));
  }

  async function sendMedia(file: File, caption: string, asAudio: boolean, clientMessageId: string): Promise<void> {
    setError(null);
    const quote = takeQuote();
    const kind = asAudio || file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'imagem' : file.type.startsWith('video/') ? 'video' : 'documento';
    const local: ThreadMessage = {
      id: `local-${clientMessageId}`, created_at: new Date().toISOString(), contact_id: contact.id, direction: 'saida', sent_from: 'painel', sent_by: me.userId, sent_by_email: me.email, connection_phone: me.phone, connection_name: me.connectionName, kind, body: caption || null,
      media_path: null, media_mime: file.type, status: 'pendente', error: null, external_id: null, client_message_id: clientMessageId, is_first_contact: false, is_follow_up: false,
      at: new Date().toISOString(), mediaUrl: URL.createObjectURL(file), meta: {}, reactions: [], edited_at: null, deleted_at: null, ...quote,
    };
    setOptimistic((list) => [...list, local]);
    const form = new FormData();
    form.set('contactId', contact.id);
    form.set('clientMessageId', clientMessageId);
    form.set('caption', caption);
    form.set('file', file);
    if (asAudio) form.set('audio', '1');
    if (quote.quoted_external_id) form.set('quotedExternalId', quote.quoted_external_id);
    const out = await sendMediaAction(form);
    if (!out.ok) setOptimistic((list) => list.map((m) => (m.client_message_id === clientMessageId ? { ...m, status: 'erro', error: out.error } : m)));
  }

  async function saveNote(text: string): Promise<boolean> {
    const out = await saveNoteAction(contact.id, text);
    if (!out.ok) setError(out.error);
    return out.ok;
  }

  async function retry(m: ThreadMessage) {
    setError(null);
    if (m.kind !== 'texto') {
      if (m.id.startsWith('local-')) setOptimistic((list) => list.filter((x) => x.id !== m.id));
      setError('Para reenviar um arquivo ou áudio, anexe de novo.');
      return;
    }
    if (m.id.startsWith('local-')) {
      setOptimistic((list) => list.filter((x) => x.id !== m.id));
      await send(m.body ?? '', crypto.randomUUID(), { quoted_external_id: m.quoted_external_id, quoted_preview: m.quoted_preview });
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

  const people: ThreadPeople = { contactName: contact.name, contactAvatar: contact.avatar_url, contactSeed: contact.id, meName: me.name, meAvatar: me.avatar, profiles };
  const options = MANUAL_STATUSES.filter((s) => s === contact.status || canSetStatus(contact.status, s));

  return (
    <section
      aria-label="Conversa"
      className="relative flex min-h-0 flex-col"
      onDragEnter={(e: DragEvent) => { if (!e.dataTransfer.types.includes('Files')) return; dragDepth.current++; setDragging(true); }}
      onDragOver={(e: DragEvent) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={(e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) setDropped({ file, n: Date.now() });
      }}
    >
      {dragging && !closed && (
        <div className="pointer-events-none absolute inset-2 z-50 flex animate-overlay-in flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-border-strong bg-background/85 backdrop-blur-sm">
          <Paperclip className="size-7 text-brand-soft" />
          <p className="text-sm font-medium">Solte para anexar</p>
          <p className="text-xs text-muted-foreground">O texto do campo vai como legenda.</p>
        </div>
      )}
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} aria-label="Voltar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground lg:hidden"><ChevronLeft className="size-4" />Voltar</Link>
          <Avatar name={contact.name} src={contact.avatar_url} seed={contact.id} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{contact.phone_e164.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <select
          aria-label="Status"
          value={contact.status}
          disabled={contact.status === 'nao_contatar' || contact.status === 'fechado'}
          onChange={(e) => void changeStatus(e.target.value as ContactStatus)}
          className="h-8 cursor-pointer rounded-md border border-input bg-input-bg px-2 text-sm outline-none xl:hidden disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-card"
        >
          {contact.status === 'fechado' && <option value="fechado">{STATUS_LABEL.fechado.label}</option>}
          {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
        </select>
        {contact.chat_state === 'fechado' ? (
          <Button variant="outline" onClick={() => void reopenChat()} title="Reabrir atendimento"><RotateCcw />Reabrir</Button>
        ) : (
          <Button variant="secondary" onClick={() => void closeChat()} title="Fechar atendimento"><CheckCircle2 />Fechar</Button>
        )}
        </div>
      </header>

      {stopRequest && dismissedFor !== lastInboundId && contact.status !== 'nao_contatar' && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-border bg-warning-subtle px-4 py-2 text-sm">
          <span className="flex items-center gap-2"><ShieldAlert className="size-4 text-warning" />Marcar como Não contatar?</span>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void changeStatus('nao_contatar')}>Sim, marcar</Button>
            <button type="button" aria-label="Fechar aviso" onClick={() => setDismissedFor(lastInboundId)} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
          </span>
        </div>
      )}
      {error && <div className="px-4 pt-3"><ErrorNote>{error}</ErrorNote></div>}

      <Thread messages={shown} legacy={legacy} now={now} onRetry={(m) => void retry(m)} onReply={!closed && !blockReason ? setReplyTo : null} people={people} />

      <Composer
        key={contact.id}
        initialText={draft}
        blockReason={blockReason}
        templates={templates}
        firstContact={contact.status === 'novo'}
        dailyCount={dailyCount}
        dailyLimit={dailyLimit}
        quickReplies={quickReplies}
        variables={variables}
        senderPhone={me.phone}
        signatureName={me.name}
        onSend={send}
        onSendMedia={sendMedia}
        onNote={saveNote}
        onAfterSendClose={closeChat}
        replyTo={replyTo ? { author: replyTo.direction === 'saida' ? 'você' : contact.name, text: messageLabel(replyTo) } : null}
        onCancelReply={() => setReplyTo(null)}
        closed={closed}
        onReopen={reopenChat}
        droppedFile={dropped}
      />
    </section>
  );
}
