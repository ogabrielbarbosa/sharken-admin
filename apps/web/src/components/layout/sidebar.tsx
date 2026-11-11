'use client';

import { Layers, LayoutGrid, LogOut, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';
import { Logo } from './logo';
import { useShell } from './shell';

const items = [
  { href: '/painel', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/painel/batches', label: 'Batches', icon: Layers },
  { href: '/painel/clientes', label: 'Clientes', icon: Users },
];

export function Sidebar({ email }: { email: string }) {
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
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col overflow-hidden bg-sidebar p-3 transition-[width,translate] duration-300 ease-(--ease-out-expo) max-lg:border-r max-lg:border-border lg:sticky lg:top-0 lg:z-auto lg:h-screen ${collapsed ? 'lg:w-17' : ''} ${mobileOpen ? '' : 'max-lg:-translate-x-full'}`}
      >
        <Link href="/painel" aria-label="Sharken — Overview" className="relative mt-2 mb-8 ml-3.5 block w-fit text-[#f4f3f3]">
          <Logo compact={collapsed} className="h-[22px] w-auto" />
        </Link>

        <p className={`relative mb-2 px-2.5 text-xs text-sidebar-label ${fade}`}>Menu</p>
        <nav className="relative space-y-1">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) || (href.endsWith('batches') && onBatch);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`group/link press relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                  active ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'
                }`}
              >
                {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] animate-indicator-in rounded-r-full bg-brand-bright shadow-[0_0_12px_#3b82f6]" />}
                <Icon className="size-4 shrink-0 transition-[scale] duration-200 ease-(--ease-spring) group-hover/link:scale-110" />
                <span className={fade}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative mt-auto flex items-center gap-2.5 p-1.5">
          <span className="size-8 shrink-0 rounded-full bg-linear-to-br from-sky-500 to-emerald-300" />
          <div className={`min-w-0 flex-1 ${fade}`}>
            <p className="truncate text-sm font-medium">Gabriel</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <form action={signOut} className={fade}>
            <button aria-label="Sair" className="press grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"><LogOut className="size-4" /></button>
          </form>
        </div>
      </aside>
    </>
  );
}

