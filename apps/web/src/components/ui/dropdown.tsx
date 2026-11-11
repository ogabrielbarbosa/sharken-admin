'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type DropdownOption = { value: string; label: string; hint?: string };

/** Select próprio para formulários: guarda o valor num input escondido e mostra uma dica ao passar o mouse. */
export function Dropdown({ name, options, defaultValue, onChange }: { name?: string; options: DropdownOption[]; defaultValue: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-accent"
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-border bg-secondary p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value} className="group relative">
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => { setValue(o.value); setOpen(false); onChange?.(o.value); }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
              >
                <Check className={`size-3.5 shrink-0 ${o.value === value ? 'opacity-100' : 'opacity-0'}`} />
                {o.label}
              </button>
              {o.hint && (
                <span role="tooltip" className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 hidden w-56 -translate-y-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-lg group-hover:block">
                  {o.hint}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
