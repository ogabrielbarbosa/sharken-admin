import { ChevronsLeft, ChevronsRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';

const Count = ({ n }: { n: number }) => (
  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs tabular-nums text-muted-foreground">{n}</span>
);

/**
 * Uma coluna do quadro. No celular só a aba ativa aparece; no desktop, todas lado a lado,
 * cada uma num painel com cabeçalho fixo e rolagem própria.
 * Com `onCollapse`, a coluna pode ser recolhida numa faixa estreita (`collapsed`) que expande ao clicar.
 * Com `trash.armed` (um cartão sendo arrastado), a coluna vira uma lixeira: soltar ali chama `trash.onDrop`.
 * Com `trash`, no desktop a coluna fica presa na borda direita do quadro: recolhida sempre,
 * aberta só durante o arraste, para estar à mão mesmo quando o quadro não cabe na tela.
 * Com `target` (o cartão arrastado pode vir para cá), a coluna se destaca e soltar ali chama `target.onDrop`.
 */
export function Column({ label, count, visible, collapsed, onExpand, onCollapse, headerStart, empty, trash, target, children }: {
  label: string; count: number; visible: boolean; collapsed?: boolean; onExpand?: () => void; onCollapse?: () => void;
  headerStart?: ReactNode; empty?: string; trash?: { armed: boolean; onDrop: () => void }; target?: { onDrop: () => void }; children: ReactNode;
}) {
  const show = visible ? 'flex' : 'hidden md:flex';
  const ref = useRef<HTMLElement>(null);
  const wasCollapsed = useRef(collapsed);
  const [over, setOver] = useState(false);
  const armed = !!trash?.armed;
  const onDrop = armed ? trash?.onDrop : target?.onDrop;
  useEffect(() => { if (!onDrop) setOver(false); }, [onDrop]);

  const dropProps = onDrop ? {
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); onDrop(); },
  } : {};
  const pin = 'md:sticky md:right-0 md:z-20 md:bg-background md:pl-2 md:shadow-[-16px_0_16px_-8px_var(--color-background)]';
  const trashLook = over
    ? 'border-dashed !border-destructive !bg-destructive-subtle text-destructive'
    : 'border-dashed !border-destructive/50 !bg-destructive/[0.04] text-destructive/80';
  const targetLook = target ? `md:border-dashed ${over ? 'md:!border-primary md:!bg-primary/[0.08]' : 'md:!border-primary/50'}` : '';

  // Ao expandir, a coluna nasce no fim do quadro, fora da tela: rola até ela.
  useEffect(() => {
    if (wasCollapsed.current && !collapsed) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    wasCollapsed.current = collapsed;
  }, [collapsed]);

  if (collapsed) {
    return (
      <section ref={ref} aria-label={label} className={`${show} shrink-0 md:h-full ${trash ? pin : ''}`} {...dropProps}>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`${label} (${count})`}
          data-tip={`Mostrar ${label.toLowerCase()}`}
          className={`flex w-full items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:bg-white/[0.04] hover:text-foreground md:h-full md:w-11 md:flex-col md:px-0 md:py-3 ${armed ? trashLook : ''}`}
        >
          {armed ? <Trash2 className={`size-4 shrink-0 transition-transform ${over ? 'scale-125' : ''}`} /> : <ChevronsLeft className="size-4 shrink-0 max-md:rotate-[-90deg]" />}
          <span className="font-medium md:[writing-mode:vertical-rl]">{label}</span>
          <Count n={count} />
        </button>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label={label} {...dropProps} className={`${show} ${armed ? pin : 'relative'} min-w-0 flex-col transition-colors md:h-full md:w-72 md:shrink-0 md:rounded-lg md:border md:border-border md:bg-white/[0.02] ${armed ? `rounded-lg border ${trashLook}` : targetLook}`}>
      {armed && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background text-sm">
          <div className={`absolute inset-0 rounded-lg ${over ? 'bg-destructive-subtle' : 'bg-destructive/[0.04]'}`} />
          <Trash2 className={`relative size-6 transition-transform ${over ? 'scale-125' : ''}`} />
          <span className="relative">Solte para descartar</span>
        </div>
      )}
      <div className="flex h-9 shrink-0 items-center gap-2 px-1 md:h-11 md:px-3">
        {headerStart}
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          <Count n={count} />
        </h2>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={`Recolher ${label.toLowerCase()}`}
            data-tip="Recolher"
            className="hidden rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:block"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-2 md:pb-16 scrollbar-none">
        {children}
        {count === 0 && empty && <li className="px-3 py-8 text-center text-xs text-subtle-foreground">{empty}</li>}
      </ul>
    </section>
  );
}
