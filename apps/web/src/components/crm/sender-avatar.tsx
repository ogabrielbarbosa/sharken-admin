'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { stableAvatar } from '@/lib/avatar-url';
import { senderInfo } from '@/lib/sender-info';
import { Avatar } from './avatar';
import type { ThreadMessage, ThreadPeople } from './thread';

export function senderOf(m: ThreadMessage, people: ThreadPeople) {
  const info = senderInfo(m, people.profiles, { name: people.meName, avatar: people.meAvatar });
  // A foto do WhatsApp expira pela própria URL: essa segue a mais nova.
  return m.sent_by ? { ...info, avatar: stableAvatar(info.avatar) } : info;
}

const sentAt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Foto de quem enviou. Mouse, foco ou toque abre o card com os detalhes. */
export function SenderAvatar({ m, people }: { m: ThreadMessage; people: ThreadPeople }) {
  const button = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const id = useId();
  const info = senderOf(m, people);

  // Em portal, para a rolagem da conversa não cortar; sem espaço em cima, abre embaixo.
  const open = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(r.top > 220 ? { right, bottom: window.innerHeight - r.top + 8 } : { right, top: r.bottom + 8 });
  };
  const close = () => setPos(null);

  const shown = pos !== null;
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => { if (!button.current?.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [shown]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={info.title}
        aria-describedby={shown ? id : undefined}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={open}
        className="block cursor-pointer rounded-full"
      >
        <Avatar name={info.avatarName} src={info.avatar} seed={info.seed} size={28} />
      </button>
      {pos && createPortal(
        <div id={id} role="tooltip" style={pos} className="pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-1rem)] animate-pop-in rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
          <div className="flex items-center gap-3">
            <Avatar name={info.avatarName} src={info.avatar} seed={info.seed} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium">{info.title}</p>
              {info.email && <p className="truncate text-xs text-muted-foreground">{info.email}</p>}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs">
            {info.connection && (
              <>
                <dt className="text-muted-foreground">Conexão</dt>
                <dd className="min-w-0 break-words">{info.connection}{info.connectionPhone && <span className="block text-muted-foreground">{info.connectionPhone}</span>}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{m.direction === 'nota' ? 'Escrita' : 'Enviada'}</dt>
            <dd>{sentAt(m.at)}</dd>
          </dl>
        </div>,
        document.body,
      )}
    </>
  );
}
