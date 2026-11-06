import { ChevronRight, Hand } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

export type Crumb = { label: string; href?: string };

export function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 lg:px-6">
      <nav className="flex min-w-0 items-center gap-2 text-sm">
        {crumbs.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
            {c.href ? (
              <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
            ) : (
              <span className="truncate">{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
        <Hand className="size-3.5" />Envio sempre manual pelo WhatsApp
      </span>
    </header>
  );
}
