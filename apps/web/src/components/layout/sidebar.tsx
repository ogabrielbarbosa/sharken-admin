'use client';

import { ChevronDown, FilePenLine, Layers, LayoutGrid, LogOut, MessageCircle, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from '@/app/login/actions';
import { Logo } from './logo';
import { useShell } from './shell';
import { WorkspaceSwitcher, type WorkspaceItem } from './workspace-switcher';

type Item = { href: string; label: string; icon: typeof LayoutGrid; exact?: boolean };
const before: Item[] = [
  { href: '/painel', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/painel/batches', label: 'Batches', icon: Layers },
];
const after: Item[] = [
  { href: '/painel/contratos', label: 'Contratos', icon: FilePenLine },
  { href: '/painel/clientes', label: 'Clientes', icon: Users },
  { href: '/painel/configuracoes', label: 'Configurações', icon: Settings },
];

const CRM = '/painel/crm';
const CONEXOES = '/painel/crm/conexoes';

export type SidebarWhatsApp = { tone: 'success' | 'warning' | 'danger' | 'neutral'; status: string };

const DOT = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', neutral: 'bg-neutral-600' } as const;
const OPEN_KEY = 'sidebar:atendimento';
const linkClass = (active: boolean) =>
  `group/link press relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${active ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'}`;

function Indicator() {
  return <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] animate-indicator-in rounded-r-full bg-brand-bright shadow-[0_0_12px_#1f88c0]" />;
}

/** Grupo "Atendimento": Conversas e Conexões. Abre e fecha e lembra a escolha. Recolhido, vira um link para as conversas. */
function AtendimentoGroup({ whatsapp, pathname, collapsed, fade }: { whatsapp: SidebarWhatsApp; pathname: string; collapsed: boolean; fade: string }) {
  const inside = pathname.startsWith(CRM);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (inside) { setOpen(true); return; }
    try { setOpen(localStorage.getItem(OPEN_KEY) !== '0'); } catch { /* sem storage */ }
  }, [inside]);
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); } catch { /* sem storage */ }
      return !v;
    });
  };
  const alert = whatsapp.tone !== 'success' ? whatsapp : null;
  const onConexoes = pathname.startsWith(CONEXOES);
  const sub = (active: boolean) => `flex h-7 items-center gap-2 rounded-md px-2 text-xs ${active ? 'bg-accent font-medium' : 'text-foreground/80 hover:bg-accent'}`;

  if (collapsed) {
    return (
      <Link href={CRM} title="Atendimento" aria-current={inside ? 'page' : undefined} className={linkClass(inside)}>
        {inside && <Indicator />}
        <MessageCircle className="size-4 shrink-0" />
        {alert && <span className={`absolute right-2 top-2 size-1.5 rounded-full ${DOT[alert.tone]}`} />}
      </Link>
    );
  }
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className={`${linkClass(inside && !open)} w-full cursor-pointer`}>
        {inside && !open && <Indicator />}
        <MessageCircle className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
        <span className={`flex-1 text-left ${fade}`}>Atendimento</span>
        {!open && alert && <span className={`size-1.5 rounded-full ${DOT[alert.tone]}`} aria-label={`WhatsApp: ${alert.status}`} />}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-5 mt-1 animate-pop-in space-y-0.5 border-l border-border pl-2">
          <Link href={CRM} aria-current={inside && !onConexoes ? 'page' : undefined} className={sub(inside && !onConexoes)}>
            <span className="flex-1 truncate">Conversas</span>
          </Link>
          <Link href={CONEXOES} title={`WhatsApp: ${whatsapp.status}`} aria-current={onConexoes ? 'page' : undefined} className={sub(onConexoes)}>
            <span className="flex-1 truncate">Conexões</span>
            <span className={`size-1.5 shrink-0 rounded-full ${DOT[whatsapp.tone]}`} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ email, whatsapp, workspaces, current, isAdmin }: { email: string; whatsapp: SidebarWhatsApp; workspaces: WorkspaceItem[]; current: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile } = useShell();
  const onBatch = pathname.startsWith('/painel/leads');
  const fold = collapsed ? 'lg:pointer-events-none lg:opacity-0 lg:-translate-x-1' : '';
  const fade = `whitespace-nowrap transition-[opacity,translate] duration-300 ease-(--ease-out-expo) ${fold}`;
  const renderItems = (list: Item[]) =>
    list.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) || (href.endsWith('batches') && onBatch);
            return (
              <Link key={href} href={href} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                {active && <Indicator />}
                <Icon className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
                <span className={fade}>{label}</span>
              </Link>
            );
          });

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
        <Link href="/painel" aria-label="Sharken — Overview" className="relative mt-2 mb-6 ml-3.5 block w-fit text-[#f4f3f3]">
          <Logo compact={collapsed} className="h-[22px] w-auto" />
        </Link>

        <WorkspaceSwitcher workspaces={workspaces} current={current} collapsed={collapsed} fade={fade} canSwitch={isAdmin} />

        <p className={`relative mb-2 px-2.5 text-xs text-sidebar-label ${fade}`}>Menu</p>
        {/* -mx-3/px-3: a rolagem corta o que sai da caixa, e o indicador fica 12px à esquerda do link. */}
        <nav className="relative -mx-3 space-y-1 overflow-y-auto px-3">
          {renderItems(before)}
          <AtendimentoGroup whatsapp={whatsapp} pathname={pathname} collapsed={collapsed} fade={fade} />
          {renderItems(after)}
        </nav>

        <div className="relative mt-auto space-y-3">
          <div className="flex items-center gap-2.5 p-1.5">
            <span className="size-8 shrink-0 rounded-full bg-brand" />
            <div className={`min-w-0 flex-1 ${fade}`}>
              <p className="truncate text-sm font-medium">{email.split('@')[0]}</p>
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
