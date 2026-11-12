'use client';

import { Check, ChevronDown, Copy } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
 * Grade rótulo → valor do painel do contato, no molde do painel de dados da LíderHub:
 * linha de 28px, rótulo de 118px com ícone de 14px, valor em 13px e campo editável
 * que parece texto até o hover (borda e fundo só aparecem ao passar o mouse).
 */

/** Seção do painel: título em caixa alta que abre e fecha, separada da próxima por uma régua. */
export function Section({ title, children, action, defaultOpen = true }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="group/section border-b border-border px-2 py-2 last:border-0">
      <div className="flex h-[26px] items-center gap-1 px-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 self-stretch rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <ChevronDown className={`size-3 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? '' : '-rotate-90'}`} aria-hidden />
          <span className="truncate text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</span>
        </button>
        {open && action}
      </div>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden" inert={!open}>{children}</div>
      </div>
    </section>
  );
}

/** Linha "ícone · rótulo · valor", com altura fixa de 28px. */
export function Row({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-2 overflow-hidden px-2">
      <span className="flex w-[118px] shrink-0 items-center gap-2 overflow-hidden text-[12px] text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg]:text-muted-foreground/70">
        {icon}<span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 self-stretch text-[13px]">{children}</span>
    </div>
  );
}

/** Valor só de leitura, com o botão de copiar no hover quando `copy` é passado. */
export function Value({ children, copy, mono }: { children: ReactNode; copy?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!copy) return;
    try { await navigator.clipboard.writeText(copy); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem permissão */ }
  };
  return (
    <span className="group/value flex min-w-0 flex-1 items-center gap-1 self-stretch">
      <span className={`min-w-0 truncate ${mono ? 'font-mono text-[12px]' : ''}`}>{children}</span>
      {copy && (
        <button type="button" onClick={() => void doCopy()} title="Copiar" aria-label="Copiar" className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/value:opacity-100">
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
        </button>
      )}
    </span>
  );
}

/** Gatilho de campo editável em linha: texto na mesma coluna dos valores, borda só no hover. */
export const inlineFieldTriggerClass = [
  'flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left outline-none transition-colors',
  '-ml-1.5 w-[calc(100%+0.375rem)] px-1.5',
  'border border-transparent bg-transparent text-[13px]',
  'hover:border-input hover:bg-muted/40',
  'focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:border-ring',
  'disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent',
].join(' ');

export type InlineOption<T extends string> = { value: T; label: string; dot?: string };

const LIST_GAP = 4;
const LIST_MIN_WIDTH = 208;

/**
 * Seletor em linha: parece texto, abre uma lista com ✓ na opção atual. A lista vai para o body (portal,
 * posição fixa): a linha e a seção recolhível têm overflow-hidden e cortariam uma lista absoluta.
 */
export function InlineSelect<T extends string>({ value, options, onChange, disabled, label }: { value: T; options: InlineOption<T>[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  // Posição a partir do gatilho; abre para cima quando não cabe embaixo. Acompanha rolagem e redimensionamento.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const height = list.current?.offsetHeight ?? options.length * 30 + 10;
      const up = r.bottom + LIST_GAP + height > window.innerHeight - 8 && r.top - LIST_GAP - height > 8;
      const width = Math.max(r.width, LIST_MIN_WIDTH);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      setPos({ left, top: up ? r.top - LIST_GAP - height : r.bottom + LIST_GAP, width, up });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Ao abrir, o foco vai para a opção atual (setas navegam entre as opções).
  useEffect(() => {
    if (open && pos) list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }, [open, pos]);

  const pick = (v: T) => { setOpen(false); trigger.current?.focus(); if (v !== value) onChange(v); };

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  return (
    <div className="relative flex min-w-0 flex-1 self-stretch">
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)} className={inlineFieldTriggerClass}>
        {current?.dot && <span className={`size-1.5 shrink-0 rounded-full ${current.dot}`} aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? '—'}</span>
        {!disabled && <ChevronDown className={`ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <ul
          ref={list}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: pos?.width ?? LIST_MIN_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
          className={`z-[100] ${pos?.up ? 'origin-bottom' : 'origin-top'} animate-pop-in rounded-md border border-border bg-card p-1 shadow-overlay`}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button type="button" role="option" aria-selected={selected} onClick={() => pick(o.value)} className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent">
                  {o.dot && <span className={`size-1.5 shrink-0 rounded-full ${o.dot}`} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {selected ? <Check className="size-3.5 shrink-0 text-brand-soft" aria-hidden /> : <span className="size-3.5 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
