import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

export function RowMenu({ children }: { children: ReactNode }) {
  return (
    <details className="group/menu relative inline-block">
      <summary aria-label="Mais ações" className="press flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground group-open/menu:bg-white/5 group-open/menu:text-foreground [&::-webkit-details-marker]:hidden">
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-44 origin-top-right animate-pop-in flex-col rounded-md border border-border bg-card p-1 shadow-overlay">{children}</div>
    </details>
  );
}

export function MenuButton({ children }: { children: ReactNode }) {
  return <button type="submit" className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5">{children}</button>;
}
