'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Só os primeiros entram em cascata: o resto está fora da tela. */
const MAX_STAGGER = 12;
/** Acima disso o salto é troca de conteúdo, não reordenação. */
const MAX_LEAVING = 6;

type Snapshot = { el: HTMLElement; top: number; height: number };
type State = { view: string; index: number; items: Map<string, Snapshot>; scroll: number };

/**
 * Lista que anima quem entra, sai e muda de lugar. Cada `<li>` precisa de `data-id`. Quando `view` muda (outra aba),
 * a lista inteira desliza para o lado da aba (`index`), e a conversa que veio junto (`keepId`) vai do lugar antigo ao novo.
 */
export function AnimatedList({ view, index, keepId, className, children }: { view: string; index: number; keepId: string | null; className?: string; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const prev = useRef<State | null>(null);
  // Onde a conversa aberta estava antes de sair da aba: a saída e a troca de aba chegam em renders separados.
  const kept = useRef<{ id: string; top: number; at: number } | null>(null);

  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const items = new Map<string, Snapshot>();
    for (const el of ul.querySelectorAll<HTMLElement>(':scope > li[data-id]')) items.set(el.dataset.id!, { el, top: el.offsetTop, height: el.offsetHeight });
    const before = prev.current;
    prev.current = { view, index, items, scroll: ul.scrollTop };
    if (!before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const switched = before.view !== view;
    const was = keepId ? before.items.get(keepId) : undefined;
    if (keepId && was) kept.current = { id: keepId, top: was.top, at: Date.now() };

    if (switched) {
      const side = Math.sign(index - before.index);
      ul.scrollTop = 0;
      let i = 0;
      for (const [id, item] of items) {
        if (i >= MAX_STAGGER) break;
        const from = kept.current;
        if (from && id === from.id && id === keepId && Date.now() - from.at < 3000) {
          item.el.animate(
            [{ transform: `translate(${side * 28}px, ${from.top - item.top}px) scale(0.97)`, opacity: 0.3 }, { transform: 'none', opacity: 1 }],
            { duration: 480, easing: EASE, fill: 'backwards' },
          );
        } else {
          item.el.animate(
            [{ transform: side ? `translateX(${side * 28}px)` : 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 240, delay: i * 14, easing: EASE, fill: 'backwards' },
          );
        }
        i++;
      }
      kept.current = null;
      ghosts.current?.replaceChildren();
      const empty = ul.querySelector<HTMLElement>(':scope > li[data-empty]');
      empty?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
      return;
    }

    const leaving = [...before.items].filter(([id]) => !items.has(id));
    if (leaving.length <= MAX_LEAVING) {
      for (const [, item] of leaving) {
        const ghost = document.createElement('div');
        ghost.append(...[...item.el.childNodes].map((n) => n.cloneNode(true)));
        Object.assign(ghost.style, { position: 'absolute', insetInline: '0', top: `${item.top - before.scroll}px`, height: `${item.height}px` });
        ghosts.current?.append(ghost);
        ghost.animate(
          [{ transform: 'none', opacity: 1 }, { transform: 'translateX(40px) scale(0.96)', opacity: 0 }],
          { duration: 160, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
        ).finished.finally(() => ghost.remove()).catch(() => {});
      }
    }
    for (const [id, item] of items) {
      const old = before.items.get(id);
      if (!old) {
        item.el.animate([{ opacity: 0, transform: 'translateY(-10px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE, fill: 'backwards' });
      } else if (old.top !== item.top) {
        item.el.animate([{ transform: `translateY(${old.top - item.top}px)` }, { transform: 'none' }], { duration: 260, easing: EASE });
      }
    }
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <ul ref={list} onScroll={(e) => { if (prev.current) prev.current.scroll = e.currentTarget.scrollTop; }} className={className}>{children}</ul>
      {/* Cópias de quem está saindo; o React não mexe aqui dentro. */}
      <div ref={ghosts} aria-hidden inert className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
