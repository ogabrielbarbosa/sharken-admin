'use client';

import { ChevronDown, FilePenLine, Layers, LayoutGrid, LogOut, MessageCircle, Plug, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from '@/app/login/actions';

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

/** Grupo "Conexões": abre e fecha, lembra a escolha e mostra o estado de cada API. */
function ConnectionsGroup({ connections, pathname }: { connections: SidebarConnection[]; pathname: string }) {
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
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm ${inside && !open ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'}`}>
        <Plug className="size-4" />
        <span className="flex-1 text-left">Conexões</span>
        {!open && alert && <span className={`size-1.5 rounded-full ${DOT[alert.tone]}`} aria-label={`WhatsApp: ${alert.status}`} />}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
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
  const onBatch = pathname.startsWith('/painel/leads');
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-4 lg:flex">
      <img src="/logo.png" alt="Sharken" className="mb-8 ml-2 mt-2 h-5 self-start" />
      <p className="mb-2 px-2 text-xs text-sidebar-label">Menu</p>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href) || (href.endsWith('batches') && onBatch);
          return (
            <Link key={href} href={href} className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${active ? 'bg-accent font-medium' : 'text-foreground/90 hover:bg-accent'}`}>
              <Icon className="size-4" />{label}
            </Link>
          );
        })}
        <ConnectionsGroup connections={connections} pathname={pathname} />
      </nav>
      <div className="mt-auto space-y-4">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Lembrete</p>
          <p className="mt-1 text-xs font-medium">Um clique por mensagem</p>
          <p className="mt-1 text-xs text-muted-foreground">Sem envio em massa nem automático. No máximo um follow-up para quem não respondeu.</p>
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="size-8 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Gabriel</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <form action={signOut}>
            <button aria-label="Sair" className="cursor-pointer text-muted-foreground hover:text-foreground"><LogOut className="size-4" /></button>
          </form>
        </div>
      </div>
    </aside>
  );
}
