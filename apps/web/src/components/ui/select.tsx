'use client';

import { Combobox } from '@base-ui/react/combobox';
import { Select as Base } from '@base-ui/react/select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from './cx';

export type SelectOption = { value: string; label: string; hint?: string };

/** A partir daqui a lista abre com um campo de busca. */
const SEARCH_FROM = 8;

const triggerClass =
  'group/select flex h-9 cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-input-bg pr-2 pl-3 text-left text-sm text-foreground outline-none select-none transition-[border-color,box-shadow,background-color] duration-200 hover:border-border-strong hover:bg-white/5 focus-visible:border-brand-bright focus-visible:ring-3 focus-visible:ring-brand-bright/20 data-popup-open:border-brand-bright disabled:cursor-not-allowed disabled:opacity-50';
const popupClass =
  'min-w-(--anchor-width) max-w-[min(26rem,var(--available-width))] origin-(--transform-origin) overflow-hidden rounded-md border border-border-strong bg-card text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-150 ease-(--ease-out-expo) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0';
const itemClass =
  'flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-[13px] outline-none select-none data-highlighted:bg-accent data-selected:font-medium';
const listClass = 'max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin]';

const Mark = ({ on }: { on: boolean }) => <Check aria-hidden className={cx('ml-auto size-3.5 shrink-0 text-brand-soft', !on && 'invisible')} />;
const Chevron = () => <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-popup-open/select:rotate-180" />;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * O único dropdown do painel (Base UI, como na LíderHub). Listas longas abrem com busca. Em formulário, `name` guarda o
 * valor; `autoSubmit` envia o formulário ao escolher (filtros). Não usar `<select>` do navegador.
 */
export function Select({ options, name, value: controlled, defaultValue, onValueChange, autoSubmit, disabled, className, size = 'default', 'aria-label': ariaLabel }: {
  options: readonly SelectOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  autoSubmit?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm';
  'aria-label'?: string;
}) {
  const initial = defaultValue ?? options[0]?.value ?? '';
  const [own, setOwn] = useState(initial);
  // O valor vindo do servidor mudou (ex.: limpar filtros).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setOwn(initial); }
  const value = controlled ?? own;
  const current = options.find((o) => o.value === value) ?? null;
  const input = useRef<HTMLInputElement>(null);

  // O React limpa o formulário depois da ação: volta ao valor inicial junto com os outros campos.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const reset = () => setOwn(initial);
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [initial]);

  const pick = (next: string | null) => {
    if (next === null || next === value) return;
    setOwn(next);
    onValueChange?.(next);
    if (autoSubmit && input.current) {
      input.current.value = next;
      input.current.form?.requestSubmit();
    }
  };

  const trigger = cx(triggerClass, size === 'sm' && 'h-8', !/(^|\s)w-/.test(className ?? '') && 'w-full', className);
  const label = <span className="min-w-0 flex-1 truncate">{current?.label ?? 'Escolha'}</span>;
  const hidden = name ? <input ref={input} type="hidden" name={name} value={value} disabled={disabled} /> : null;

  if (options.length >= SEARCH_FROM) {
    return (
      <>
        {hidden}
        <Combobox.Root
          items={options}
          value={current}
          onValueChange={(o: SelectOption | null) => pick(o?.value ?? null)}
          itemToStringLabel={(o: SelectOption) => o.label}
          isItemEqualToValue={(a: SelectOption, b: SelectOption) => a.value === b.value}
          filter={(o: SelectOption, query: string) => normalize(o.label).includes(normalize(query.trim()))}
          disabled={disabled}
        >
          <Combobox.Trigger aria-label={ariaLabel} className={trigger}>{label}<Chevron /></Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={4} align="start" className="z-[1100]">
              <Combobox.Popup data-select-popup="" aria-label={ariaLabel} className={popupClass}>
                <div className="relative border-b border-border">
                  <Search aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
                  <Combobox.Input placeholder="Buscar…" aria-label="Buscar opção" className="h-9 w-full bg-transparent pr-3 pl-8 text-[13px] outline-none placeholder:text-subtle-foreground" />
                </div>
                <Combobox.Empty className="px-3 text-xs text-muted-foreground [&:not(:empty)]:py-3">Nada encontrado.</Combobox.Empty>
                <Combobox.List className={cx(listClass, 'data-empty:p-0')}>
                  {(o: SelectOption) => (
                    <Combobox.Item key={o.value} value={o} data-tip={o.hint} data-tip-side={o.hint ? 'left' : undefined} className={itemClass}>
                      <span className="min-w-0 truncate">{o.label}</span><Mark on={o.value === value} />
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </>
    );
  }

  return (
    <>
      {hidden}
      <Base.Root modal={false} items={options} value={value} onValueChange={(v) => pick(v)} disabled={disabled}>
        <Base.Trigger aria-label={ariaLabel} className={trigger}>{label}<Chevron /></Base.Trigger>
        <Base.Portal>
          <Base.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="z-[1100]">
            <Base.Popup data-select-popup="" className={popupClass}>
              <Base.List className={listClass}>
                {options.map((o) => (
                  <Base.Item key={o.value} value={o.value} data-tip={o.hint} data-tip-side={o.hint ? 'left' : undefined} className={itemClass}>
                    <Base.ItemText className="min-w-0 truncate">{o.label}</Base.ItemText><Mark on={o.value === value} />
                  </Base.Item>
                ))}
              </Base.List>
            </Base.Popup>
          </Base.Positioner>
        </Base.Portal>
      </Base.Root>
    </>
  );
}
