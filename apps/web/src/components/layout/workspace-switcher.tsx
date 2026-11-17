'use client';

import { Check, ChevronsUpDown, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { switchWorkspaceAction } from '@/app/painel/workspaces/actions';

export type WorkspaceItem = { id: string; name: string };

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || 'W';

/** Workspace em uso no topo do menu, com a lista para trocar e o atalho para gerenciar. */
export function WorkspaceSwitcher({ workspaces, current, collapsed, fade }: { workspaces: WorkspaceItem[]; current: string; collapsed: boolean; fade: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const active = workspaces.find((w) => w.id === current) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!active) return null;
  return (
    <div ref={ref} className="relative mb-4">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={collapsed ? active.name : undefined}
        // Recolhido, o menu cortaria a lista: leva para a página de workspaces.
        onClick={() => (collapsed && window.matchMedia('(min-width: 1024px)').matches ? (window.location.href = '/painel/workspaces') : setOpen((v) => !v))}
        className="press flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-white/[0.02] px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded bg-brand text-xs font-semibold text-brand-foreground">{initial(active.name)}</span>
        <span className={`min-w-0 flex-1 truncate font-medium ${fade}`}>{pending ? 'Trocando…' : active.name}</span>
        <ChevronsUpDown className={`size-3.5 shrink-0 text-muted-foreground ${fade}`} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 origin-top animate-pop-in rounded-md border border-border bg-card p-1 shadow-overlay">
          <p className="px-2 py-1 text-xs text-muted-foreground">Workspaces</p>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="option"
              aria-selected={w.id === current}
              disabled={pending}
              onClick={() => {
                setOpen(false);
                if (w.id !== current) start(() => switchWorkspaceAction(w.id));
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/5"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded bg-brand-muted text-[10px] font-semibold text-brand-soft">{initial(w.name)}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === current && <Check className="size-3.5 text-brand-soft" />}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <Link href="/painel/workspaces" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <Settings2 className="size-3.5" />Gerenciar workspaces
          </Link>
        </div>
      )}
    </div>
  );
}
