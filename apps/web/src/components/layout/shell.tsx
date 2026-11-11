'use client';

import { PanelLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Shell = { collapsed: boolean; mobileOpen: boolean; toggle: () => void; closeMobile: () => void };
const ShellContext = createContext<Shell | null>(null);

export const SIDEBAR_COOKIE = 'sidebar';

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell fora do ShellProvider');
  return ctx;
}

/** Estado da barra lateral. No desktop ela recolhe (e a escolha fica num cookie); no celular abre por cima. */
export function ShellProvider({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggle() {
    if (window.matchMedia('(max-width: 1023px)').matches) return setMobileOpen((o) => !o);
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? 'open' : 'collapsed'}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }

  return <ShellContext.Provider value={{ collapsed, mobileOpen, toggle, closeMobile: () => setMobileOpen(false) }}>{children}</ShellContext.Provider>;
}

export function SidebarToggle() {
  const { collapsed, toggle } = useShell();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar menu"
      title={collapsed ? 'Expandir menu' : 'Recolher menu'}
      className="press grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
    >
      <PanelLeft className={`size-4 transition-transform duration-300 ease-(--ease-out-expo) ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  );
}
