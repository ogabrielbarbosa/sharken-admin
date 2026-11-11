'use client';

import { FilePenLine, Layers, LayoutGrid, LogOut, MessageCircle, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/login/actions';

const items = [
  { href: '/painel', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/painel/batches', label: 'Batches', icon: Layers },
  { href: '/painel/crm', label: 'CRM', icon: MessageCircle },
  { href: '/painel/contratos', label: 'Contratos', icon: FilePenLine },
  { href: '/painel/pagamentos', label: 'Pagamentos', icon: Wallet },
  { href: '/painel/clientes', label: 'Clientes', icon: Users },
];

export function Sidebar({ email }: { email: string }) {
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
