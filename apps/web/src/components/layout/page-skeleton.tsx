import type { ReactNode } from 'react';

/** Barra do topo enquanto a página carrega: mesmo tamanho da `Topbar`, com a trilha em cinza. */
export function TopbarSkeleton() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/70 px-3 backdrop-blur-xl lg:px-4">
      <span className="skeleton size-7" />
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      <span className="skeleton ml-1 h-4 w-20" />
      <span className="skeleton h-4 w-32" />
    </header>
  );
}

/** Página genérica carregando: topo, título e alguns blocos. O conteúdo aparece com um leve atraso para não piscar. */
export function PageSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div role="status" aria-label="Carregando" className="animate-fade-in [animation-delay:80ms]">
      <TopbarSkeleton />
      <main className="space-y-4 p-4 lg:p-6">
        {children ?? (
          <>
            <span className="skeleton block h-7 w-56" />
            <span className="skeleton block h-4 w-80 max-w-full" />
            <div className="grid gap-4 pt-2 md:grid-cols-3">
              <span className="skeleton block h-28 rounded-card" />
              <span className="skeleton block h-28 rounded-card" />
              <span className="skeleton block h-28 rounded-card" />
            </div>
            <span className="skeleton block h-64 rounded-card" />
          </>
        )}
      </main>
    </div>
  );
}
