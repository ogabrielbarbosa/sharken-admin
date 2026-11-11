import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { SidebarToggle } from './shell';

export type Crumb = { label: string; href?: string };

export function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/70 px-3 backdrop-blur-xl lg:px-4">
      <SidebarToggle />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <nav className="flex min-w-0 items-center gap-1.5 pl-1 text-sm">
        {crumbs.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" />}
            {c.href ? (
              <Link href={c.href} className="truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground">{c.label}</Link>
            ) : (
              <span className="truncate font-medium">{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
    </header>
  );
}
