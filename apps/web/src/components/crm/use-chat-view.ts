'use client';

import { useRef, useState } from 'react';
import { crmHref } from '@/lib/crm';
import { replaceChatUrl, useChatUrl, type ChatView } from './use-chat-url';

const keyOf = (v: ChatView) => crmHref(v.tab, { filters: v.filters });

/**
 * Aba e filtros em estado local, para a lista responder no clique mesmo com um refresh do servidor em andamento.
 * A URL acompanha, e uma navegação de fora (abrir um lead no CRM, voltar) vale sobre o estado local.
 */
export function useChatView() {
  const url = useChatUrl();
  const urlKey = keyOf(url);
  const [view, setView] = useState<ChatView>({ tab: url.tab, filters: url.filters });
  const [seen, setSeen] = useState(urlKey);
  // Chaves que esta tela escreveu: a URL pode chegar atrasada e não deve desfazer um clique mais novo.
  const [written, setWritten] = useState<string[]>([]);
  if (seen !== urlKey) {
    setSeen(urlKey);
    if (written.at(-1) === urlKey) setWritten([]);
    else if (!written.includes(urlKey)) { setWritten([]); setView({ tab: url.tab, filters: url.filters }); }
  }

  const latest = useRef(view);
  latest.current = view;
  const change = (patch: Partial<ChatView>) => {
    const next = { ...latest.current, ...patch };
    const key = keyOf(next);
    if (key === keyOf(latest.current)) return;
    latest.current = next;
    setView(next);
    setWritten((list) => [...list, key]);
    replaceChatUrl(next.tab, { q: url.search, contato: url.contactId ?? undefined, filters: next.filters });
  };
  return { view, change, search: url.search };
}
