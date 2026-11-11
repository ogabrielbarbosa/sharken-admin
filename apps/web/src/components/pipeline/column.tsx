import type { ReactNode } from 'react';

/** Uma coluna do quadro. No celular só a aba ativa aparece; no desktop, todas, cada uma com rolagem própria. */
export function Column({ label, count, visible, collapsed, onExpand, onCollapse, empty, children }: {
  label: string; count: number; visible: boolean; collapsed?: boolean; onExpand?: () => void; onCollapse?: () => void; empty?: string; children: ReactNode;
}) {
  const show = visible ? 'flex' : 'hidden md:flex';
  if (collapsed) {
    return (
      <section aria-label={label} className={`${show} shrink-0 flex-col md:w-auto`}>
        <button type="button" onClick={onExpand} className="rounded-md border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground md:[writing-mode:vertical-rl]">
          {label} ({count})
        </button>
      </section>
    );
  }
  return (
    <section aria-label={label} className={`${show} min-w-0 flex-col md:w-72 md:shrink-0`}>
      <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-medium">
        {onCollapse ? <button type="button" onClick={onCollapse} className="hover:underline">{label}</button> : label}
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs">{count}</span>
      </h2>
      <ul className="flex flex-col gap-2 md:max-h-[calc(100vh-15rem)] md:overflow-y-auto md:pr-1">
        {children}
        {count === 0 && empty && <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{empty}</li>}
      </ul>
    </section>
  );
}
