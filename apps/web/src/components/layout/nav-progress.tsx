'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Só aparece se a navegação passar disso; as instantâneas não piscam a barra. */
const SHOW_AFTER_MS = 120;
/** Se a URL não mudar até aqui (erro, mesma página), a barra some. */
const GIVE_UP_MS = 20_000;

/**
 * Barra fina no topo enquanto a próxima página carrega. Começa no clique de um link interno
 * (antes de o `<Link>` do Next cancelar o clique) e termina quando a URL muda.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trickle = useRef<ReturnType<typeof setInterval>>(undefined);
  const loading = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    clearInterval(trickle.current);
  };

  const finish = () => {
    if (!loading.current) return;
    loading.current = false;
    clear();
    setProgress((p) => (p == null ? null : 1));
    timers.current.push(setTimeout(() => setProgress(null), 320));
  };

  useEffect(() => {
    const start = () => {
      clear();
      loading.current = true;
      timers.current.push(
        setTimeout(() => {
          setProgress(0.12);
          // Anda rápido no começo e cada vez mais devagar, sem chegar ao fim.
          trickle.current = setInterval(() => setProgress((p) => (p == null ? p : p + (0.9 - p) * 0.08)), 200);
        }, SHOW_AFTER_MS),
        setTimeout(finish, GIVE_UP_MS),
      );
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    return () => { document.removeEventListener('click', onClick, true); clear(); };
  }, []);

  // A URL mudou: a página nova chegou.
  useEffect(finish, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full origin-left bg-brand-bright shadow-[0_0_8px_var(--color-brand)] transition-[transform,opacity] duration-200 ease-out"
        style={{ transform: `scaleX(${progress ?? 0})`, opacity: progress == null || progress === 1 ? 0 : 1, transitionDuration: progress === 1 ? '200ms, 300ms' : undefined, transitionDelay: progress === 1 ? '0ms, 120ms' : undefined }}
      />
    </div>
  );
}
