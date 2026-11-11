'use client';

import { AlertCircle, Calendar, Check, CheckCheck, Clock, FileText, RotateCcw } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '@lps/domain';
import { clock, dayKey, dayLabel } from '@/lib/crm';
import { createUrlCache } from '@/lib/media-cache';

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
  if (!m.mediaUrl) return <p className="mb-1 text-xs italic text-muted-foreground">{label} (arquivo indisponível)</p>;
  if (m.kind === 'imagem') return <a href={m.mediaUrl} target="_blank" rel="noreferrer"><img src={m.mediaUrl} alt="Imagem recebida" className="mb-1 max-h-64 rounded-md" /></a>;
  if (m.kind === 'audio') return <audio controls src={m.mediaUrl} className="mb-1 max-w-full" />;
  if (m.kind === 'video') return <video controls src={m.mediaUrl} className="mb-1 max-h-64 rounded-md" />;
  return <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 inline-flex items-center gap-1.5 text-sm underline"><FileText className="size-4" />{label}</a>;
}

function Bubble({ m, onRetry }: { m: ThreadMessage; onRetry: (m: ThreadMessage) => void }) {
  const mine = m.direction === 'saida';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-xl border px-3 py-2 ${mine ? 'border-emerald-900/60 bg-emerald-950/60' : 'border-border bg-card'}`}>
        <Media m={m} />
        {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          {mine && m.sent_from === 'celular' && <span>pelo celular ·</span>}
          {clock(m.at)}{mine && <Ticks status={m.status} />}
        </p>
        {m.status === 'erro' && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-destructive">
            <span>{m.error ?? 'Não foi possível enviar.'}</span>
            <button type="button" onClick={() => onRetry(m)} className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap font-medium hover:underline"><RotateCcw className="size-3" />Tentar de novo</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Thread({ messages, legacy, now, onRetry }: {
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
  messages.forEach((m) => {
    const day = dayKey(new Date(m.at));
    if (day !== lastDay) {
      lastDay = day;
      items.push(<Pill key={`d-${m.id}`} icon={<Calendar />}>{dayLabel(m.at, now)}{m.is_first_contact ? ' · primeiro contato' : ''}</Pill>);
    }
    items.push(<div key={m.id} className="my-1"><Bubble m={m} onRetry={onRetry} /></div>);
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {legacy.map((l) => (
        <p key={l.at + l.label} className="my-1 text-center text-xs text-neutral-500">{l.label} · {dayLabel(l.at, now)}</p>
      ))}
      {messages.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Ainda não há mensagens com este contato.</p>}
      {items}
      <div ref={end} />
    </div>
  );
}
