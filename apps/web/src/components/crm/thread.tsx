'use client';

import { AlertCircle, Calendar, Check, CheckCheck, Clock, FileText, RotateCcw, StickyNote } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '@lps/domain';
import { clock, dayKey, dayLabel } from '@/lib/crm';
import { createUrlCache } from '@/lib/media-cache';
import { Avatar } from './avatar';

// Assinadas por 24 h no servidor; o cliente troca a URL só depois de 20 h.
const urlCache = createUrlCache(20 * 3600_000);

export type LegacyLine = { at: string; label: string };
export type ThreadMessage = Message & { mediaUrl?: string | null };

function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground [&_svg]:size-3.5">{icon}{children}</span>
    </div>
  );
}

function Ticks({ status }: { status: Message['status'] }) {
  if (status === 'pendente') return <Clock aria-label="Enviando" className="size-3" />;
  if (status === 'enviada') return <Check aria-label="Enviada" className="size-3" />;
  if (status === 'entregue') return <CheckCheck aria-label="Entregue" className="size-3" />;
  if (status === 'lida') return <CheckCheck aria-label="Lida" className="size-3 text-sky-400" />;
  if (status === 'erro') return <AlertCircle aria-label="Erro" className="size-3 text-destructive" />;
  return null;
}

function Media({ m: msg }: { m: ThreadMessage }) {
  if (msg.kind === 'texto') return null;
  const m = { ...msg, mediaUrl: msg.media_path ? urlCache.resolve(msg.media_path, msg.mediaUrl) : msg.mediaUrl };
  const label = { imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', documento: 'Documento', outro: 'Arquivo' }[msg.kind];
  if (!m.mediaUrl) return <p className="mb-1 text-xs italic text-muted-foreground">{msg.status === 'pendente' ? `Enviando ${label.toLowerCase()}…` : `${label} (arquivo indisponível)`}</p>;
  if (m.kind === 'imagem') return <a href={m.mediaUrl} target="_blank" rel="noreferrer"><img src={m.mediaUrl} alt="Imagem" className="mb-1 max-h-72 rounded-lg" /></a>;
  if (m.kind === 'audio') return <audio controls src={m.mediaUrl} className="mb-1 h-10 w-64 max-w-full" />;
  if (m.kind === 'video') return <video controls src={m.mediaUrl} className="mb-1 max-h-72 rounded-lg" />;
  const name = m.media_path?.split('/').pop() ?? label;
  return <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm hover:bg-black/30"><FileText className="size-5 shrink-0" /><span className="truncate">{label} · {name}</span></a>;
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

function Bubble({ m, onRetry, showMeta, people, now }: { m: ThreadMessage; onRetry: (m: ThreadMessage) => void; showMeta: boolean; people: ThreadPeople; now: Date }) {
  const mine = m.direction === 'saida';
  const avatar = mine
    ? <Avatar name={people.meName} src={people.meAvatar} seed="eu" size={28} />
    : <Avatar name={people.contactName} src={people.contactAvatar} seed={people.contactSeed} size={28} />;
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <span className="w-7 shrink-0">{showMeta && avatar}</span>}
      <div className={`flex max-w-[72%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-3.5 py-2 ${mine ? 'bg-[#16263f] text-slate-50' : 'bg-secondary text-foreground'} ${showMeta ? (mine ? 'rounded-br-md' : 'rounded-bl-md') : ''}`}>
          <Media m={m} />
          {m.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>}
        </div>
        {m.status === 'erro' && (
          <div className="mt-1 flex items-center gap-3 text-xs text-destructive">
            <span>{m.error ?? 'Não foi possível enviar.'}</span>
            <button type="button" onClick={() => onRetry(m)} className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap font-medium hover:underline"><RotateCcw className="size-3" />Tentar de novo</button>
          </div>
        )}
        {showMeta && m.status !== 'erro' && (
          <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            {mine && <Ticks status={m.status} />}
            {mine && m.sent_from === 'celular' && <span>pelo celular ·</span>}
            {clock(m.at)} {dayKey(new Date(m.at)) !== dayKey(now) && new Date(m.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}
          </p>
        )}
      </div>
      {mine && <span className="w-7 shrink-0">{showMeta && avatar}</span>}
    </div>
  );
}

const GROUP_MS = 5 * 60_000;

export function Thread({ messages, legacy, now, onRetry, people }: {
  people: ThreadPeople;
  messages: ThreadMessage[];
  legacy: LegacyLine[];
  now: Date;
  onRetry: (m: ThreadMessage) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length, last?.status, last?.id]);

  let lastDay = '';
  const items: ReactNode[] = [];
  messages.forEach((m, i) => {
    const day = dayKey(new Date(m.at));
    if (day !== lastDay) {
      lastDay = day;
      items.push(<Pill key={`d-${m.id}`} icon={<Calendar />}>{dayLabel(m.at, now)}{m.is_first_contact ? ' · primeiro contato' : ''}</Pill>);
    }
    if (m.direction === 'nota') {
      items.push(<NoteBubble key={m.id} m={m} />);
    } else {
      // Só a última de uma sequência do mesmo lado (em até 5 min) mostra a foto e o horário.
      const next = messages[i + 1];
      const last = !next || next.direction !== m.direction || new Date(next.at).getTime() - new Date(m.at).getTime() > GROUP_MS || dayKey(new Date(next.at)) !== day;
      items.push(<div key={m.id} className={last ? 'mb-3 mt-0.5' : 'my-0.5'}><Bubble m={m} onRetry={onRetry} showMeta={last} people={people} now={now} /></div>);
    }
  });

  return (
    // Como num chat: as mensagens ficam presas embaixo e a conversa cresce para cima.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4">
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
