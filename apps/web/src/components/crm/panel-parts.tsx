'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/** Seção do painel do contato: título em caixa alta que abre e fecha. */
export function Section({ title, children, action, defaultOpen = true }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border px-4 py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ChevronDown className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />{title}
        </button>
        {open && action}
      </div>
      {open && <div className="mt-2.5 space-y-0.5">{children}</div>}
    </section>
  );
}

/** Linha "ícone · rótulo · valor", como uma ficha. */
export function Row({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2 text-[13px]">
      <span className="flex w-[132px] shrink-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">{icon}<span className="truncate">{label}</span></span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

/** Select sem borda, que parece texto até receber o mouse. */
export function InlineSelect<T extends string>({ value, options, onChange, disabled, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <span className="relative -ml-1.5 flex items-center">
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 w-full cursor-pointer appearance-none truncate rounded-md bg-transparent pl-1.5 pr-6 text-[13px] outline-none hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent [&>option]:bg-card"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {!disabled && <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground" />}
    </span>
  );
}
