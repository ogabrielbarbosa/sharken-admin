'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Tip = { text: string; rect: DOMRect; side: Side };

const ID = 'app-tooltip';
const DELAY_MS = 120;
const GAP = 9;
const EDGE = 8;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
const ORIGIN: Record<Side, string> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
/** Os dois lados do quadradinho girado que ficam para fora do balão. */
const ARROW: Record<Side, string> = { top: 'border-r border-b', bottom: 'border-l border-t', left: 'border-t border-r', right: 'border-b border-l' };

/**
 * O único tooltip do painel. Qualquer elemento com `data-tip="texto"` ganha a dica ao passar o mouse ou focar pelo
 * teclado; `data-tip-side="right"` muda o lado (padrão: em cima, ou embaixo quando não cabe). Não usar `title` em HTML.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const target = useRef<Element | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      target.current?.removeAttribute('aria-describedby');
      target.current = null;
      setTip(null);
    };
    const show = (el: Element) => {
      if (el === target.current) return;
      hide();
      if (!el.getAttribute('data-tip')) return;
      target.current = el;
      timer = setTimeout(() => {
        const text = el.getAttribute('data-tip');
        if (!text || !el.isConnected) return hide();
        if (!el.hasAttribute('aria-describedby') && el.getAttribute('aria-label') !== text) el.setAttribute('aria-describedby', ID);
        setTip({ text, rect: el.getBoundingClientRect(), side: (el.getAttribute('data-tip-side') as Side | null) ?? 'top' });
      }, DELAY_MS);
    };
    const closest = (e: Event) => (e.target instanceof Element ? e.target.closest('[data-tip]') : null);
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = closest(e);
      if (el) show(el);
      else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = closest(e);
      if (el?.matches(':focus-visible')) show(el);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    // O elemento pode sumir da tela (clique, atualização) sem o mouse sair dele.
    const check = setInterval(() => { if (target.current && !target.current.isConnected) hide(); }, 300);

    document.addEventListener('pointerover', onOver);
    document.documentElement.addEventListener('pointerleave', hide);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      hide();
      clearInterval(check);
      document.removeEventListener('pointerover', onOver);
      document.documentElement.removeEventListener('pointerleave', hide);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);

  return tip ? <Bubble key={`${tip.rect.x}:${tip.rect.y}:${tip.text}`} {...tip} /> : null;
}

function Bubble({ text, rect, side: wanted }: Tip) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; arrow: number; side: Side } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    // Popover: fica por cima até dos <dialog> modais.
    el.showPopover?.();
    const { offsetWidth: w, offsetHeight: h } = el;
    let side = wanted;
    if (side === 'top' && rect.top - h - GAP < EDGE) side = 'bottom';
    else if (side === 'bottom' && rect.bottom + h + GAP > innerHeight - EDGE) side = 'top';
    else if (side === 'right' && rect.right + w + GAP > innerWidth - EDGE) side = 'left';
    else if (side === 'left' && rect.left - w - GAP < EDGE) side = 'right';
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vertical = side === 'top' || side === 'bottom';
    const x = vertical ? clamp(cx - w / 2, EDGE, innerWidth - w - EDGE) : side === 'right' ? rect.right + GAP : rect.left - w - GAP;
    const y = vertical ? (side === 'top' ? rect.top - h - GAP : rect.bottom + GAP) : clamp(cy - h / 2, EDGE, innerHeight - h - EDGE);
    // A setinha segue apontando para o elemento mesmo com o balão encostado na borda.
    setAt({ x, y, side, arrow: vertical ? clamp(cx - x, 10, w - 10) : clamp(cy - y, 10, h - 10) });
  }, [rect, text, wanted]);

  const side = at?.side ?? wanted;
  const vertical = side === 'top' || side === 'bottom';
  const origin = vertical ? `${at?.arrow ?? 0}px ${ORIGIN[side]}` : `${ORIGIN[side]} ${at?.arrow ?? 0}px`;
  return (
    <div
      ref={ref}
      id={ID}
      role="tooltip"
      popover="manual"
      style={{ left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed inset-auto z-[1200] m-0 w-max max-w-72 overflow-visible border-0 bg-transparent p-0"
    >
      <div className={`relative rounded-md border border-border-strong bg-card px-2.5 py-1.5 text-xs font-medium whitespace-pre-line text-foreground shadow-overlay ${at ? 'animate-tooltip-in' : ''}`} style={{ transformOrigin: origin }}>
        {text}
        <span
          aria-hidden
          className={`absolute size-2 rotate-45 border-border-strong bg-card ${ARROW[side]}`}
          style={{ [ORIGIN[side]]: -5, [vertical ? 'left' : 'top']: (at?.arrow ?? 0) - 5 }}
        />
      </div>
    </div>
  );
}
