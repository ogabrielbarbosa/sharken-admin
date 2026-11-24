'use client';

import { BookOpen, FilePenLine, Layers, LayoutGrid, LogOut, MessageCircle, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';
import { Avatar } from '@/components/crm/avatar';
import { Logo } from './logo';
import { useShell } from './shell';
import { WorkspaceSwitcher, type WorkspaceItem } from './workspace-switcher';

type Item = { href: string; label: string; icon: typeof LayoutGrid; exact?: boolean };
const before: Item[] = [
  { href: '/painel', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/painel/leads', label: 'Leads', icon: Layers },
];
const after: Item[] = [
  { href: '/painel/contratos', label: 'Contratos', icon: FilePenLine },
  { href: '/painel/clientes', label: 'Clientes', icon: Users },
  { href: '/painel/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/painel/instrucoes', label: 'Instruções', icon: BookOpen },
];

const CRM = '/painel/crm';

export type SidebarWhatsApp = { tone: 'success' | 'warning' | 'danger' | 'neutral'; status: string };

const DOT = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', neutral: 'bg-neutral-600' } as const;
const linkClass = (active: boolean) =>
  `group/link press relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${active ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'}`;

function Indicator() {
  return <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] animate-indicator-in rounded-r-full bg-brand-bright shadow-[0_0_12px_#1f88c0]" />;
}

/** Atendimento: um link só, para as conversas. A bolinha avisa quando o WhatsApp não está conectado. */
function AtendimentoLink({ whatsapp, pathname, collapsed, fade }: { whatsapp: SidebarWhatsApp; pathname: string; collapsed: boolean; fade: string }) {
  const active = pathname.startsWith(CRM);
  const alert = whatsapp.tone !== 'success' ? whatsapp : null;
  return (
    <Link href={CRM} data-tip-side="right" data-tip={collapsed ? 'Atendimento' : undefined} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
      {active && <Indicator />}
      <MessageCircle className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
      <span className={`flex-1 ${fade}`}>Atendimento</span>
      {alert && (
        <span
          className={`size-1.5 shrink-0 rounded-full ${DOT[alert.tone]} ${collapsed ? 'absolute right-2 top-2' : ''}`}
          aria-label={`WhatsApp: ${alert.status}`}
          data-tip-side="right" data-tip={`WhatsApp: ${alert.status}`}
        />
      )}
    </Link>
  );
}

export function Sidebar({ user, whatsapp, workspaces, current, isAdmin }: { user: { id: string; name: string; avatarUrl: string | null }; whatsapp: SidebarWhatsApp; workspaces: WorkspaceItem[]; current: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile } = useShell();
  const onBatch = pathname.startsWith('/painel/batches');
  const fold = collapsed ? 'lg:pointer-events-none lg:opacity-0 lg:-translate-x-1' : '';
  const fade = `whitespace-nowrap transition-[opacity,translate] duration-300 ease-(--ease-out-expo) ${fold}`;
  const renderItems = (list: Item[]) =>
    list.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) || (href.endsWith('leads') && onBatch);
            return (
              <Link key={href} href={href} data-tip-side="right" data-tip={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
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
          <AtendimentoLink whatsapp={whatsapp} pathname={pathname} collapsed={collapsed} fade={fade} />
          {renderItems(after)}
        </nav>

        <div className="relative mt-auto space-y-3">
          <div className="flex items-center gap-2.5 p-1.5">
            <Avatar name={user.name} src={user.avatarUrl} seed={user.id} size={32} />
            <div className={`min-w-0 flex-1 ${fade}`}>
              <p className="truncate text-sm font-medium">{user.name}</p>
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
