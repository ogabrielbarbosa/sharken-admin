'use client';

import { ChevronDown, FilePenLine, Layers, LayoutGrid, LogOut, MessageCircle, Plug, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from '@/app/login/actions';
import { Logo } from './logo';
import { useShell } from './shell';

const items = [
  { href: '/painel', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/painel/batches', label: 'Batches', icon: Layers },
  { href: '/painel/crm', label: 'CRM', icon: MessageCircle },
  { href: '/painel/contratos', label: 'Contratos', icon: FilePenLine },
  { href: '/painel/pagamentos', label: 'Pagamentos', icon: Wallet },
  { href: '/painel/clientes', label: 'Clientes', icon: Users },
];

export type SidebarConnection = { slug: string; label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; status: string };

const DOT = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', neutral: 'bg-neutral-600' } as const;
const OPEN_KEY = 'sidebar:conexoes';
const linkClass = (active: boolean) =>
  `group/link press relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${active ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'}`;

function Indicator() {
  return <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] animate-indicator-in rounded-r-full bg-brand-bright shadow-[0_0_12px_#3b82f6]" />;
}

/** Grupo "Conexões": abre e fecha, lembra a escolha e mostra o estado de cada API. Recolhido, vira um link. */
function ConnectionsGroup({ connections, pathname, collapsed, fade }: { connections: SidebarConnection[]; pathname: string; collapsed: boolean; fade: string }) {
  const inside = pathname.startsWith('/painel/conexoes');
  const [open, setOpen] = useState(inside);
  useEffect(() => {
    if (inside) return;
    try { setOpen(localStorage.getItem(OPEN_KEY) === '1'); } catch { /* sem storage */ }
  }, [inside]);
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); } catch { /* sem storage */ }
      return !v;
    });
  };
  const alert = connections.find((c) => c.slug === 'whatsapp' && c.tone !== 'success');

  if (collapsed) {
    return (
      <Link href="/painel/conexoes/whatsapp" title="Conexões" aria-current={inside ? 'page' : undefined} className={`${linkClass(inside)}`}>
        {inside && <Indicator />}
        <Plug className="size-4 shrink-0" />
        {alert && <span className={`absolute right-2 top-2 size-1.5 rounded-full ${DOT[alert.tone]}`} />}
      </Link>
    );
  }
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className={`${linkClass(inside && !open)} w-full cursor-pointer`}>
        {inside && !open && <Indicator />}
        <Plug className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
        <span className={`flex-1 text-left ${fade}`}>Conexões</span>
        {!open && alert && <span className={`size-1.5 rounded-full ${DOT[alert.tone]}`} aria-label={`WhatsApp: ${alert.status}`} />}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-5 mt-1 animate-pop-in space-y-0.5 border-l border-border pl-2">
          <Link href="/painel/conexoes" className={`flex h-7 items-center rounded-md px-2 text-xs ${pathname === '/painel/conexoes' ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}>Todas as APIs</Link>
          {connections.map((c) => {
            const href = `/painel/conexoes/${c.slug}`;
            const active = pathname === href;
            return (
              <Link key={c.slug} href={href} title={c.status} className={`flex h-7 items-center gap-2 rounded-md px-2 text-xs ${active ? 'bg-accent font-medium' : 'text-foreground/80 hover:bg-accent'}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${DOT[c.tone]}`} />
                <span className="flex-1 truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ email, connections }: { email: string; connections: SidebarConnection[] }) {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile } = useShell();
  const onBatch = pathname.startsWith('/painel/leads');
  const fold = collapsed ? 'lg:pointer-events-none lg:opacity-0 lg:-translate-x-1' : '';
  const fade = `whitespace-nowrap transition-[opacity,translate] duration-300 ease-(--ease-out-expo) ${fold}`;

  return (
    <>
      {/* Fundo escuro do menu aberto no celular. */}
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={closeMobile}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col overflow-hidden bg-sidebar p-3 transition-[width,translate] duration-300 ease-(--ease-out-expo) max-lg:border-r max-lg:border-border lg:static lg:z-auto lg:h-full ${collapsed ? 'lg:w-17' : ''} ${mobileOpen ? '' : 'max-lg:-translate-x-full'}`}
      >
        <Link href="/painel" aria-label="Sharken — Overview" className="relative mt-2 mb-8 ml-3.5 block w-fit text-[#f4f3f3]">
          <Logo compact={collapsed} className="h-[22px] w-auto" />
        </Link>

        <p className={`relative mb-2 px-2.5 text-xs text-sidebar-label ${fade}`}>Menu</p>
        <nav className="relative space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) || (href.endsWith('batches') && onBatch);
            return (
              <Link key={href} href={href} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                {active && <Indicator />}
                <Icon className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
                <span className={fade}>{label}</span>
              </Link>
            );
          })}
          <ConnectionsGroup connections={connections} pathname={pathname} collapsed={collapsed} fade={fade} />
        </nav>

        <div className="relative mt-auto space-y-3">
          {!collapsed && (
            <div className="rounded-lg border border-border bg-background p-3 max-lg:hidden">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Lembrete</p>
              <p className="mt-1 text-xs font-medium">Um clique por mensagem</p>
              <p className="mt-1 text-xs text-muted-foreground">Sem envio em massa nem automático. No máximo um follow-up para quem não respondeu.</p>
            </div>
          )}
          <div className="flex items-center gap-2.5 p-1.5">
            <span className="size-8 shrink-0 rounded-full bg-linear-to-br from-sky-500 to-emerald-300" />
            <div className={`min-w-0 flex-1 ${fade}`}>
              <p className="truncate text-sm font-medium">Gabriel</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <form action={signOut} className={fade}>
              <button aria-label="Sair" className="press grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"><LogOut className="size-4" /></button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
