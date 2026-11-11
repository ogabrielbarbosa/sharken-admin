'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { refreshAvatarsAction } from '@/app/painel/conexoes/actions';

/** Busca na Evolution as fotos que faltam dos contatos na tela (no máximo 15 por vez, a cada 3 dias por contato). */
export function AvatarRefresher({ ids, enabled }: { ids: string[]; enabled: boolean }) {
  const router = useRouter();
  const key = ids.join(',');
  const done = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled || !key || done.current.has(key)) return;
    done.current.add(key);
    void refreshAvatarsAction(key.split(',')).then((out) => { if (out.updated) router.refresh(); });
  }, [key, enabled, router]);
  return null;
}
