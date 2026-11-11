'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/** Diálogo do quadro. Fecha com Esc ou no X, volta para `closeHref` e põe o foco no primeiro campo. */
export function Modal({ title, subtitle, closeHref, nav, footer, wide, children }: {
  title: string; subtitle?: ReactNode; closeHref: string; nav?: ReactNode; footer?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal?.();
    const first = dialog.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), textarea:not([disabled])');
    first?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); router.replace(closeHref, { scroll: false }); }}
      onClick={(e) => { if (e.target === ref.current) router.replace(closeHref, { scroll: false }); }}
      className={`m-auto max-h-[92vh] w-[calc(100%-2rem)] overflow-hidden rounded-card border border-border bg-card p-0 text-foreground backdrop:bg-black/60 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {nav}
            <Link href={closeHref} replace scroll={false} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">{footer}</footer>}
      </div>
    </dialog>
  );
}
