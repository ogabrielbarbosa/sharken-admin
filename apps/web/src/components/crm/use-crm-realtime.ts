'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const DEBOUNCE_MS = 300;

/**
 * Escuta mudanças de `messages` (só do contato aberto) e de `contacts` (todos) e pede à página que
 * recarregue os dados. Vários eventos seguidos viram um só refresh.
 */
export function useCrmRealtime(contactId: string | null) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };
    const channel = supabase.channel(`crm-${contactId ?? 'lista'}`).on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, refresh);
    if (contactId) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `contact_id=eq.${contactId}` }, refresh);
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [contactId, router]);
}

/** Componente sem tela, para a página de servidor ligar o Realtime. */
export function CrmRealtime({ contactId }: { contactId: string | null }) {
  useCrmRealtime(contactId);
  return null;
}
