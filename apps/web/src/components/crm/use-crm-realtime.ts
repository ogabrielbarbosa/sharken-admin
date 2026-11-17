'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useWorkspaceId } from '@/components/layout/workspace';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const DEBOUNCE_MS = 300;
const RETRY_MS = 3000;

/**
 * Escuta mudanças de `messages` (só do contato aberto) e de `contacts` (todos) e pede à página que
 * recarregue os dados. Vários eventos seguidos viram um só refresh.
 *
 * As políticas só liberam `authenticated`: o canal precisa entrar com o token da sessão. Se entrar
 * antes de a sessão carregar, entra como anônimo e o Realtime não entrega nada, sem erro nenhum.
 * Por isso o token vai para o Realtime antes da assinatura, e o canal é refeito se cair.
 */
export function useCrmRealtime(contactId: string | null) {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;

    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const subscribe = async () => {
      const { data } = await supabase.auth.getSession();
      if (stopped) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      // Solta o canal antigo antes de removê-lo, para o CLOSED dele não agendar outra tentativa.
      const old = channel;
      channel = null;
      if (old) await supabase.removeChannel(old);
      if (stopped) return;
      const ch = supabase.channel(`crm-${contactId ?? 'lista'}-${Date.now()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', ...(workspaceId ? { filter: `workspace_id=eq.${workspaceId}` } : {}) }, refresh);
      if (contactId) ch.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, refresh);
      channel = ch;
      ch.subscribe((status) => {
        if (stopped || channel !== ch) return;
        // Voltou a conectar: recarrega para pegar o que chegou enquanto estava fora.
        if (status === 'SUBSCRIBED') refresh();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(retry);
          retry = setTimeout(() => void subscribe(), RETRY_MS);
        }
      });
    };

    void subscribe();
    // Token renovado (a cada hora): o Realtime precisa do novo, senão para de entregar quando o antigo expira.
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) void supabase.realtime.setAuth(session.access_token);
    });
    // Aba voltou a ficar visível depois de muito tempo: confere se perdeu algo.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(retry);
      auth.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      const ch = channel;
      channel = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [contactId, router, workspaceId]);
}

/** Componente sem tela, para a página de servidor ligar o Realtime. */
export function CrmRealtime({ contactId }: { contactId: string | null }) {
  useCrmRealtime(contactId);
  return null;
}
