import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

export function RowMenu({ children }: { children: ReactNode }) {
  return (
    <details className="relative inline-block">
      <summary aria-label="Mais ações" className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
        <MoreHorizontal className="size-4" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-44 flex-col rounded-md border border-border bg-secondary p-1 shadow-lg">{children}</div>
    </details>
  );
}

export function MenuButton({ children }: { children: ReactNode }) {
  return <button type="submit" className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm hover:bg-neutral-700">{children}</button>;
}
