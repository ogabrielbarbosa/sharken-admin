'use client';

import { attendanceGate, canIntervene, canSetStatus, type Contact, type ContactStatus, type MemberProfile } from '@lps/domain';
import { CheckCircle2, ChevronLeft, Loader2, LockOpen, Paperclip, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { closeChatAction, markReadAction, openChatAction, retryMessageAction, saveNoteAction, sendMediaAction, sendMessageAction, setChatResponsibleAction, setStatusAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote, Select } from '@/components/ui';
import { crmHref, STATUS_LABEL } from '@/lib/crm';
import { Avatar } from './avatar';
import { Composer, type QuickReplyItem, type Template, type Variable } from './composer';
import { replaceChatUrl, useChatUrl } from './use-chat-url';
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
  stopRequest: boolean;
  dailyCount: number;
  dailyLimit: number;
  quickReplies: QuickReplyItem[];
  variables: Variable[];
  me: { userId: string; email: string; name: string; avatar: string | null; phone: string | null; connectionName: string | null };
  responsibleName: string | null;
  /** Só membro pode ser responsável (o administrador da plataforma pode não ser). */
  isMember: boolean;
  /** Perfil de quem enviou mensagens nesta conversa, por usuário. */
  profiles: Record<string, MemberProfile>;
};

export function Conversation({ contact, messages, legacy, now, draft, templates, blockReason, stopRequest, dailyCount, dailyLimit, quickReplies, variables, me, responsibleName, isMember, profiles }: ConversationProps) {
  const router = useRouter();
  const { tab, filters, search, closing } = useChatUrl();
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [dropped, setDropped] = useState<{ file: File; n: number } | null>(null);
  /** Abrindo ou fechando o atendimento. */
  const [changing, setChanging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [intervening, setIntervening] = useState(false);
  const gate = attendanceGate(contact, me.userId);
  const gated = !!gate && !intervening;
  // A intervenção vale para um envio e cai quando o atendimento muda.
  useEffect(() => { setIntervening(false); }, [contact.chat_state, contact.responsible_id]);
  const lastInboundId = [...messages].reverse().find((m) => m.direction === 'entrada')?.id ?? null;

  // O servidor traz a mensagem real: o balão local sai assim que o clientMessageId aparece.
  const serverIds = useMemo(() => new Set(messages.map((m) => m.client_message_id).filter(Boolean)), [messages]);
  useEffect(() => {
    setOptimistic((list) => (list.some((m) => serverIds.has(m.client_message_id)) ? list.filter((m) => !serverIds.has(m.client_message_id)) : list));
  }, [serverIds]);
  const shown = useMemo(() => [...messages, ...optimistic.filter((m) => !serverIds.has(m.client_message_id))], [messages, optimistic, serverIds]);

  // A aba segue o estado quando ele muda (enviou num fechado, fechou, reabriu, chegou mensagem). Fora isso a pessoa
  // troca de aba à vontade com a conversa aberta.
  const followed = useRef<string | null>(null);
  useEffect(() => {
    const state = contact.chat_state;
    if (followed.current === state) return;
    followed.current = state;
    if (search || closing || state === tab) return;
    replaceChatUrl(state, { contato: contact.id, filters });
  }, [contact.id, contact.chat_state, tab, search, closing, filters]);

  async function closeChat() {
    setChanging(true);
    const out = await closeChatAction(contact.id).finally(() => setChanging(false));
    if (!out.ok) return setError(out.error);
    setReplyTo(null);
  }

  async function openChat() {
    setChanging(true);
    const out = await openChatAction(contact.id).finally(() => setChanging(false));
    if (!out.ok) return setError(out.error);
  }

  async function takeOver() {
    const out = await setChatResponsibleAction(contact.id, me.userId);
    setError(out.ok ? null : out.error);
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
    const intervention = intervening && !again;
    if (intervention) setIntervening(false);
    const local: ThreadMessage = {
      id: `local-${clientMessageId}`, created_at: new Date().toISOString(), contact_id: contact.id, direction: 'saida', sent_from: 'painel', sent_by: me.userId, sent_by_email: me.email, connection_phone: me.phone, connection_name: me.connectionName, kind: 'texto', body: text,
      media_path: null, media_mime: null, status: 'pendente', error: null, external_id: null, client_message_id: clientMessageId, is_first_contact: false, is_follow_up: false, at: new Date().toISOString(),
      meta: {}, reactions: [], edited_at: null, deleted_at: null, ...quote,
    };
    setOptimistic((list) => [...list, local]);
    const out = await sendMessageAction(contact.id, text, clientMessageId, quote.quoted_external_id, intervention);
    if (!out.ok) setOptimistic((list) => list.map((m) => (m.client_message_id === clientMessageId ? { ...m, status: 'erro', error: out.error } : m)));
  }

  async function sendMedia(file: File, caption: string, asAudio: boolean, clientMessageId: string): Promise<void> {
    setError(null);
    const quote = takeQuote();
    const intervention = intervening;
    if (intervention) setIntervening(false);
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
    if (intervention) form.set('intervention', '1');
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
      className="relative flex min-h-0 animate-page-in flex-col"
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
      {dragging && !gated && (
        <div className="pointer-events-none absolute inset-2 z-50 flex animate-overlay-in flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-border-strong bg-background/85 backdrop-blur-sm">
          <Paperclip className="size-7 text-brand-soft" />
          <p className="text-sm font-medium">Solte para anexar</p>
          <p className="text-xs text-muted-foreground">O texto do campo vai como legenda.</p>
        </div>
      )}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={crmHref(tab, { q: search, filters })} aria-label="Voltar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground lg:hidden"><ChevronLeft className="size-4" />Voltar</Link>
          <Avatar name={contact.name} src={contact.avatar_url} seed={contact.id} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contact.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{contact.phone_e164.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <Select
          aria-label="Status"
          size="sm"
          className="w-40 xl:hidden"
          value={contact.status}
          disabled={contact.status === 'nao_contatar' || contact.status === 'fechado'}
          onValueChange={(v) => void changeStatus(v as ContactStatus)}
          options={[...(contact.status === 'fechado' ? (['fechado'] as const) : []), ...options].map((s) => ({ value: s, label: STATUS_LABEL[s].label }))}
        />
        {contact.chat_state !== 'aberto' ? (
          <Button key="abrir" variant="outline" className="animate-fade-in" disabled={changing} onClick={() => void openChat()} data-tip="Abrir atendimento">{changing ? <Loader2 className="animate-spin" /> : <LockOpen />}Abrir</Button>
        ) : (
          <Button key="fechar" variant="secondary" className="animate-fade-in" disabled={changing} onClick={() => void closeChat()} data-tip="Fechar atendimento">{changing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Fechar</Button>
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

      <Thread messages={shown} legacy={legacy} now={now} onRetry={(m) => void retry(m)} onReply={!gated && !blockReason ? setReplyTo : null} people={people} />

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
        signatureName={me.name}
        onSend={send}
        onSendMedia={sendMedia}
        onNote={saveNote}
        onAfterSendClose={closeChat}
        replyTo={replyTo ? { author: replyTo.direction === 'saida' ? 'você' : contact.name, text: messageLabel(replyTo) } : null}
        onCancelReply={() => setReplyTo(null)}
        gate={gated ? gate : null}
        responsibleName={responsibleName}
        canTakeOver={isMember}
        canIntervene={!!gate && canIntervene(gate, isMember)}
        intervening={!!gate && intervening}
        onOpen={openChat}
        onTakeOver={takeOver}
        onIntervene={() => setIntervening(true)}
        droppedFile={dropped}
      />
    </section>
  );
}
