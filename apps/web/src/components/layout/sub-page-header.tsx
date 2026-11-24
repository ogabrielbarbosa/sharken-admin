import Link from 'next/link';

export type SubPage = { href: string; label: string };

/** Cabeçalho padrão de tela com subpáginas: abas sublinhadas (o título da tela fica na barra do topo). `current` é o href da aba aberta. */
export function SubPageHeader({ label, pages, current }: { label: string; pages: readonly SubPage[]; current: string }) {
  return (
    <div className="border-b border-border px-4 lg:px-6">
      <nav aria-label={`Subpáginas de ${label}`} className="-mb-px flex gap-6 overflow-x-auto overflow-y-hidden">
        {pages.map((page) => {
          const active = page.href === current;
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={active ? 'page' : undefined}
              className={`relative shrink-0 rounded-t-sm py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {page.label}
              {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-bright shadow-[0_0_12px_#1f88c0]" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
