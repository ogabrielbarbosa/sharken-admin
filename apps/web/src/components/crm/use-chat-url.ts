'use client';

import type { ChatState } from '@lps/domain';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { crmHref, parseChatFilters, parseChatTab, type ChatFilters } from '@/lib/crm';

export type ChatView = { tab: ChatState; filters: ChatFilters };

/** Aba, busca e filtros da URL. Aba e filtros mudam só no navegador: o servidor manda todas as conversas. */
export function useChatUrl(): ChatView & { search: string; contactId: string | null; closing: boolean } {
  const params = useSearchParams();
  return useMemo(() => ({
    tab: parseChatTab(params.get('aba')),
    filters: parseChatFilters((key) => params.get(key)),
    search: params.get('q')?.trim() ?? '',
    contactId: params.get('contato'),
    closing: params.get('fechar') === '1',
  }), [params]);
}

/** Troca a URL sem ir ao servidor. */
export function replaceChatUrl(tab: ChatState, extra: Parameters<typeof crmHref>[1]) {
  window.history.replaceState(null, '', crmHref(tab, extra));
}
