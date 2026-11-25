'use client';

import type { ChatState } from '@lps/domain';
import { CHAT_TABS } from '@/lib/crm';

/** Abas do estado do atendimento. A conversa aberta continua na tela ao trocar de aba. */
export function ChatTabs({ tab, counts, onChange }: { tab: ChatState; counts: Record<ChatState, number>; onChange: (tab: ChatState) => void }) {
  const index = CHAT_TABS.findIndex((t) => t.key === tab);

  return (
    <nav className="relative mx-3 my-3 grid shrink-0 grid-cols-3 gap-1 rounded-lg bg-secondary p-1" aria-label="Estado do atendimento">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-1rem)/3)] rounded-md bg-background shadow-sm transition-transform duration-350 ease-(--ease-out-expo)"
        style={{ transform: `translateX(calc(${index} * (100% + 0.25rem)))` }}
      />
      {CHAT_TABS.map((t) => {
        const active = t.key === tab;
        const n = counts[t.key] ?? 0;
        const alert = t.key === 'pendente' && n > 0;
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
            <span className={`min-w-5 rounded-full px-1.5 text-center text-[10px] leading-4 transition-colors duration-200 ${alert ? 'bg-success text-background' : active ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}>
              {/* A troca do número remonta o texto e refaz a animação. */}
              <span key={n} className="inline-block animate-check-pop">{n}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
