'use client';

import { AlertCircle, Ban, Calendar, Check, CheckCheck, Clock, Reply, RotateCcw, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Message } from '@lps/domain';
import { clock, dayKey, dayLabel } from '@/lib/crm';
import { createUrlCache } from '@/lib/media-cache';
import { Avatar } from './avatar';
import { ForwardedTag, hidesBody, MessageButtons, MessageContent } from './message-content';

// Assinadas por 24 h no servidor; o cliente troca a URL só depois de 20 h.
const urlCache = createUrlCache(20 * 3600_000);

export type LegacyLine = { at: string; label: string };
export type ThreadMessage = Message & { mediaUrl?: string | null };

const KIND_LABEL: Record<Message['kind'], string> = {
  texto: 'Mensagem', imagem: '📷 Imagem', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Documento',
  sticker: 'Figurinha', localizacao: '📍 Localização', contato: '👤 Contato', enquete: '📊 Enquete', outro: 'Mensagem',
};

/** Texto curto de uma mensagem, para citação: o corpo ou o tipo de mídia. */
export function messageLabel(m: Pick<Message, 'kind' | 'body'> & { meta?: Message['meta'] | null }): string {
  if (m.kind === 'documento' && !m.body?.trim() && m.meta?.fileName) return `📄 ${m.meta.fileName}`;
  if (m.kind === 'contato' && m.meta?.contacts?.length) return `👤 ${m.meta.contacts.map((c) => c.name).join(', ')}`;
  return m.body?.trim() || KIND_LABEL[m.kind];
}

/** Chave estável: o balão otimista e o que volta do servidor são o mesmo elemento (não pisca nem anima de novo). */
const keyOf = (m: ThreadMessage) => m.client_message_id ?? m.id;

function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground [&_svg]:size-3.5">{icon}{children}</span>
    </div>
  );
}

/** pop: o tique entra com um pulinho (só em mensagem que chegou com a conversa aberta). */
function Ticks({ status, pop }: { status: Message['status']; pop: boolean }) {
  const p = pop ? 'animate-check-pop' : '';
  if (status === 'pendente') return <Clock aria-label="Enviando" className="size-3 animate-pulse" />;
  if (status === 'enviada') return <Check aria-label="Enviada" className={`size-3 ${p}`} />;
  // Não há confirmação de leitura: o máximo que se mostra é entregue (dois checks cinza).
  if (status === 'entregue' || status === 'lida') return <CheckCheck aria-label="Entregue" className={`size-3 ${p}`} />;
  if (status === 'erro') return <AlertCircle aria-label="Erro" className="size-3 text-destructive" />;
  return null;
}

export type ThreadPeople = { contactName: string; contactAvatar: string | null; contactSeed: string; meName: string; meAvatar: string | null };

function NoteBubble({ m }: { m: ThreadMessage }) {
  return (
    <div className="my-2 flex justify-end pr-9">
      <div className="max-w-[70%] rounded-xl border border-amber-500/25 bg-amber-950/40 px-3.5 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-300/80"><StickyNote className="size-3" />Nota interna</p>
        <p className="whitespace-pre-wrap break-words text-sm text-amber-50/90">{m.body}</p>
        <p className="mt-1 text-right text-[11px] text-amber-200/50">{clock(m.at)}</p>
      </div>
    </div>
  );
}

/** Citação dentro do balão. Clicar leva até a original quando ela está na conversa. */
function Quote({ author, text, mine, onJump }: { author: string | null; text: string; mine: boolean; onJump: (() => void) | null }) {
  const body = (
    <>
      <span className={`block text-xs font-semibold ${mine ? 'text-sky-300' : 'text-brand-soft'}`}>{author ?? 'Mensagem citada'}</span>
      <span className="line-clamp-2 text-xs opacity-80">{text}</span>
    </>
  );
  const cls = `mb-1.5 block w-full min-w-40 rounded-lg border-l-[3px] px-2.5 py-1.5 text-left ${mine ? 'border-sky-400 bg-black/25' : 'border-brand-soft bg-black/20'}`;
  return onJump
    ? <button type="button" onClick={onJump} className={`${cls} cursor-pointer transition-colors hover:bg-black/40`}>{body}</button>
    : <span className={cls}>{body}</span>;
}

type BubbleProps = {
  m: ThreadMessage;
  onRetry: (m: ThreadMessage) => void;
  onReply: ((m: ThreadMessage) => void) | null;
  quote: { author: string | null; text: string; onJump: (() => void) | null } | null;
  showMeta: boolean;
  people: ThreadPeople;
  now: Date;
  animate: boolean;
};

/** Reações presas na borda de baixo do balão, como no WhatsApp. */
function Reactions({ reactions, mine, contactName }: { reactions: Message['reactions']; mine: boolean; contactName: string }) {
  const who = reactions.map((r) => `${r.from === 'eu' ? 'Você' : contactName}: ${r.emoji}`).join('\n');
  return (
    <span title={who} className={`absolute -bottom-3.5 ${mine ? 'right-2' : 'left-2'} flex animate-pop-in items-center gap-0.5 rounded-full border border-background bg-secondary px-1.5 py-0.5 text-sm leading-none shadow`}>
      {reactions.map((r) => <span key={r.from}>{r.emoji}</span>)}
      {reactions.length > 1 && <span className="ml-0.5 text-[10px] text-muted-foreground">{reactions.length}</span>}
    </span>
  );
}

function Bubble({ m, onRetry, onReply, quote, showMeta, people, now, animate }: BubbleProps) {
  const mine = m.direction === 'saida';
  // Figurinha sozinha fica sem balão, como no WhatsApp.
  const bare = m.kind === 'sticker' && !m.body && !quote;
  const deleted = !!m.deleted_at;
  // A URL assinada muda a cada refresh: guardar a primeira evita o player reiniciar.
  const view = m.media_path ? { ...m, mediaUrl: urlCache.resolve(m.media_path, m.mediaUrl) } : m;
  const avatar = mine
    ? <Avatar name={people.meName} src={people.meAvatar} seed="eu" size={28} />
    : <Avatar name={people.contactName} src={people.contactAvatar} seed={people.contactSeed} size={28} />;
  // Só responde a mensagem que já existe no WhatsApp (tem id de lá).
  const reply = onReply && m.external_id ? (
    <button
      type="button"
      aria-label="Responder"
      title="Responder"
      onClick={() => onReply(m)}
      className="press mb-1 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center self-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Reply className="size-4" />
    </button>
  ) : null;
  return (
    <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <span className="w-7 shrink-0">{showMeta && avatar}</span>}
      {mine && reply}
      <div className={`flex max-w-[72%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div
          onDoubleClick={() => { if (onReply && m.external_id) onReply(m); }}
          className={`relative ${bare ? '' : `rounded-2xl px-3.5 py-2 ${mine ? 'bg-[#16263f] text-slate-50' : 'bg-secondary text-foreground'}`} ${mine ? 'origin-bottom-right' : 'origin-bottom-left'} ${showMeta && !bare ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''} ${animate ? (mine ? 'animate-bubble-out' : 'animate-bubble-in') : ''} ${m.status === 'pendente' ? 'opacity-80' : ''} ${deleted ? 'opacity-60 ring-1 ring-dashed ring-muted-foreground/40' : ''} ${m.reactions?.length ? 'mb-3' : ''} transition-opacity duration-300`}
        >
          {deleted && <p className="mb-1 flex items-center gap-1 text-[11px] italic text-muted-foreground"><Ban className="size-3" />Apagada para todos no WhatsApp</p>}
          {m.meta?.forwarded && <ForwardedTag />}
          {quote && <Quote author={quote.author} text={quote.text} mine={mine} onJump={quote.onJump} />}
          {m.meta?.title && <p className="mb-1 text-sm font-semibold">{m.meta.title}</p>}
          {m.kind !== 'texto' && <div className={m.body && !hidesBody(m) ? 'mb-1.5' : ''}><MessageContent m={view} mine={mine} people={{ me: { name: people.meName, src: people.meAvatar }, contact: { name: people.contactName, src: people.contactAvatar, seed: people.contactSeed } }} /></div>}
          {m.body && !hidesBody(m) && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>}
          {m.meta?.footer && <p className="mt-1 text-xs text-muted-foreground">{m.meta.footer}</p>}
          {m.meta && <MessageButtons meta={m.meta} />}
          {m.reactions?.length > 0 && <Reactions reactions={m.reactions} mine={mine} contactName={people.contactName} />}
        </div>
        {m.status === 'erro' && (
          <div className="mt-1 flex animate-slide-up items-center gap-3 text-xs text-destructive">
            <span>{m.error ?? 'Não foi possível enviar.'}</span>
            <button type="button" onClick={() => onRetry(m)} className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap font-medium hover:underline"><RotateCcw className="size-3" />Tentar de novo</button>
          </div>
        )}
        {showMeta && m.status !== 'erro' && (
          <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            {mine && <Ticks key={m.status} status={m.status} pop={animate} />}
            {mine && m.sent_from === 'celular' && <span>pelo celular ·</span>}
            {m.edited_at && <span title={m.meta?.original_body ? `Antes: ${m.meta.original_body}` : undefined} className="cursor-default italic">editada ·</span>}
            {clock(m.at)} {dayKey(new Date(m.at)) !== dayKey(now) && new Date(m.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}
          </p>
        )}
      </div>
      {!mine && reply}
      {mine && <span className="w-7 shrink-0">{showMeta && avatar}</span>}
    </div>
  );
}

const GROUP_MS = 5 * 60_000;

export function Thread({ messages, legacy, now, onRetry, onReply, people }: {
  people: ThreadPeople;
  messages: ThreadMessage[];
  legacy: LegacyLine[];
  now: Date;
  onRetry: (m: ThreadMessage) => void;
  /** null: conversa sem envio (fechada ou bloqueada), sem botão de responder. */
  onReply: ((m: ThreadMessage) => void) | null;
}) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  // O que já estava na tela ao abrir a conversa não anima; só o que chega ou sai depois.
  const initial = useRef<Set<string> | null>(null);
  if (initial.current === null) initial.current = new Set(messages.map(keyOf));
  const mounted = useRef(false);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: mounted.current ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [messages.length, last?.status, last?.id]);

  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);
  const jump = useCallback((id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
  }, []);

  const byExternal = useMemo(() => new Map(messages.flatMap((m) => (m.external_id ? [[m.external_id, m] as const] : []))), [messages]);

  let lastDay = '';
  const items: ReactNode[] = [];
  messages.forEach((m, i) => {
    const day = dayKey(new Date(m.at));
    if (day !== lastDay) {
      lastDay = day;
      items.push(<Pill key={`d-${keyOf(m)}`} icon={<Calendar />}>{dayLabel(m.at, now)}{m.is_first_contact ? ' · primeiro contato' : ''}</Pill>);
    }
    if (m.direction === 'nota') {
      items.push(<div key={keyOf(m)} className={initial.current!.has(keyOf(m)) ? '' : 'animate-slide-up'}><NoteBubble m={m} /></div>);
      return;
    }
    // Só a última de uma sequência do mesmo lado (em até 5 min) mostra a foto e o horário.
    const next = messages[i + 1];
    const lastOfGroup = !next || next.direction !== m.direction || new Date(next.at).getTime() - new Date(m.at).getTime() > GROUP_MS || dayKey(new Date(next.at)) !== day;
    const original = m.quoted_external_id ? byExternal.get(m.quoted_external_id) : undefined;
    const quote = m.quoted_external_id
      ? {
          author: original ? (original.direction === 'saida' ? 'Você' : people.contactName) : null,
          text: original ? messageLabel(original) : (m.quoted_preview ?? 'Mensagem'),
          onJump: original ? () => jump(original.id) : null,
        }
      : null;
    items.push(
      <div key={keyOf(m)} id={`msg-${m.id}`} className={`-mx-2 rounded-xl px-2 ${lastOfGroup ? 'mb-3 mt-0.5' : 'my-0.5'} ${flash === m.id ? 'animate-flash' : ''}`}>
        <Bubble m={m} onRetry={onRetry} onReply={onReply} quote={quote} showMeta={lastOfGroup} people={people} now={now} animate={!initial.current!.has(keyOf(m))} />
      </div>,
    );
  });

  return (
    // Como num chat: as mensagens ficam presas embaixo e a conversa cresce para cima.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-5 pt-4">
      <div className="mt-auto">
        {legacy.map((l) => (
          <p key={l.at + l.label} className="my-1 text-center text-xs text-neutral-500">{l.label} · {dayLabel(l.at, now)}</p>
        ))}
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Ainda não há mensagens com este contato.</p>}
        {items}
        <div ref={end} className="h-2" />
      </div>
    </div>
  );
}
