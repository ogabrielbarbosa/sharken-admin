'use client';

import {
  EMPTY_FILTER, FILTER_GROUP_KEYS, FILTER_GROUPS, MOTIVO_NOTE, NUMBER_FILTERS, ORDER_OPTIONS,
  activeFilterCount, cycleOption, optionState, serializeReviewFilter,
  type FilterGroupKey, type GroupFilter, type NumberKey, type OptionState, type ReviewFilter,
} from '@lps/domain';
import { Check, Minus, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { Dropdown } from '@/components/ui/dropdown';

type Counts = Record<FilterGroupKey, Record<string, number>>;

const hrefFor = (batchId: string, f: ReviewFilter) => {
  const qs = serializeReviewFilter(f);
  return `/painel/batches/${batchId}${qs ? `?${qs}` : ''}`;
};

/** Tooltip em posição fixa, preso dentro da tela, para não ser cortado pelo popover. */
function useTooltip() {
  const [tip, setTip] = useState<{ text: string; left: number; top: number } | null>(null);
  const show = (text: string) => (e: { currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const width = 240;
    setTip({ text, top: r.top - 6, left: Math.min(Math.max(r.left + r.width / 2 - width / 2, 8), window.innerWidth - width - 8) });
  };
  const node = tip && (
    <div role="tooltip" style={{ left: tip.left, top: tip.top, width: 240 }} className="pointer-events-none fixed z-50 -translate-y-full animate-fade-in rounded-md border border-border bg-card px-2.5 py-1.5 text-xs leading-snug text-foreground shadow-lg">
      {tip.text}
    </div>
  );
  return { show, hide: () => setTip(null), node };
}

const STATE_HINT: Record<OptionState, string> = {
  off: 'Clique para incluir.',
  incluir: 'Incluído. Clique para excluir.',
  excluir: 'Excluído. Clique para limpar.',
};

function Group({ groupKey, value, counts, onChange }: { groupKey: FilterGroupKey; value?: GroupFilter; counts: Record<string, number>; onChange: (g: GroupFilter | undefined) => void }) {
  const { label, options } = FILTER_GROUPS[groupKey];
  const tooltip = useTooltip();

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {groupKey === 'motivo' && <span className="ml-1.5 normal-case tracking-normal">· {MOTIVO_NOTE.toLowerCase().replace(/\.$/, '')}</span>}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const state = optionState(value, o.value);
          const tone = {
            off: 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
            incluir: 'border-brand-bright bg-brand-bright/20 text-brand-pale shadow-[0_0_12px_-4px_#3b82f6]',
            excluir: 'border-destructive/60 bg-destructive/15 text-destructive',
          }[state];
          const tip = `${o.hint} ${STATE_HINT[state]}`;
          return (
            <button
              key={o.value}
              type="button"
              aria-label={`${o.label}: ${state === 'off' ? 'sem filtro' : state}`}
              onClick={(e) => { onChange(cycleOption(value, o.value)); tooltip.show(`${o.hint} ${STATE_HINT[{ off: 'incluir', incluir: 'excluir', excluir: 'off' }[state] as OptionState]}`)(e); }}
              onMouseEnter={tooltip.show(tip)}
              onMouseLeave={tooltip.hide}
              onFocus={tooltip.show(tip)}
              onBlur={tooltip.hide}
              className={`press inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tone}`}
            >
              {state === 'incluir' && <Check className="size-3 animate-check-pop" />}
              {state === 'excluir' && <Minus className="size-3 animate-check-pop" />}
              <span className={state === 'excluir' ? 'line-through' : ''}>{o.label}</span>
              <span className={state === 'off' ? 'text-muted-foreground' : 'opacity-70'}>{counts[o.value] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {tooltip.node}
    </section>
  );
}

/** Botão "Filtros" com popover. Cada mudança já filtra a lista; o filtro fica na URL. */
export function ReviewFilters({ batchId, filter, counts, shown, total }: { batchId: string; filter: ReviewFilter; counts: Counts; shown: number; total: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filter);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const minsText = (f: ReviewFilter) => Object.fromEntries(NUMBER_FILTERS.map((n) => [n.key, f.mins[n.key] === undefined ? '' : String(f.mins[n.key])]));
  const [minText, setMinText] = useState<Record<string, string>>(() => minsText(filter));
  const serverQs = serializeReviewFilter(filter);
  const draftQs = useRef(serverQs);

  // Quando o filtro muda por fora (ex.: "Ver todos" ou tirar uma etiqueta), o popover acompanha.
  useEffect(() => {
    if (serverQs === draftQs.current) return;
    draftQs.current = serverQs;
    setDraft(filter);
    setMinText(minsText(filter));
  }, [serverQs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function update(next: ReviewFilter, delay = 0) {
    setDraft(next);
    draftQs.current = serializeReviewFilter(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.replace(hrefFor(batchId, next), { scroll: false }), delay);
  }

  const setGroup = (key: FilterGroupKey, g: GroupFilter | undefined) => {
    const groups = { ...draft.groups };
    if (g) groups[key] = g; else delete groups[key];
    update({ ...draft, groups });
  };

  const setMin = (key: NumberKey, raw: string) => {
    setMinText((t) => ({ ...t, [key]: raw }));
    const mins = { ...draft.mins };
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() && Number.isFinite(n) && n >= 0) mins[key] = n; else delete mins[key];
    update({ ...draft, mins }, 400);
  };

  const count = activeFilterCount(draft);

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <SlidersHorizontal />Filtros
        {count > 0 && <span className="animate-check-pop rounded-full bg-brand-bright px-1.5 text-xs text-white">{count}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(26rem,calc(100vw-2rem))] origin-top-right animate-pop-in rounded-lg border border-border bg-card/95 shadow-overlay backdrop-blur-xl">
          <div className="space-y-4 p-4">
            {FILTER_GROUP_KEYS.map((key) => (
              <Group key={key} groupKey={key} value={draft.groups[key]} counts={counts[key]} onChange={(g) => setGroup(key, g)} />
            ))}
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mínimo de</h3>
              <div className="grid grid-cols-3 gap-2">
                {NUMBER_FILTERS.map((n) => (
                  <label key={n.key} className="flex items-center rounded-md border border-border bg-input-bg pl-2.5 text-xs text-muted-foreground transition-colors focus-within:border-brand-bright">
                    {n.label}
                    <input
                      type="number"
                      min={0}
                      step={n.step}
                      value={minText[n.key]}
                      onChange={(e) => setMin(n.key, e.target.value)}
                      placeholder="–"
                      className="h-8 w-full min-w-0 bg-transparent px-2 text-right text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </label>
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ordenar por</h3>
              <Dropdown
                key={draft.ordem}
                options={ORDER_OPTIONS.map((o) => ({ ...o }))}
                defaultValue={draft.ordem}
                onChange={(v) => update({ ...draft, ordem: v as ReviewFilter['ordem'] })}
              />
            </section>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground"><span className="font-medium text-foreground">{shown}</span> de {total} leads</span>
            <button type="button" disabled={count === 0} onClick={() => { setMinText(minsText(EMPTY_FILTER)); update(EMPTY_FILTER); }} className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40">
              Limpar tudo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Faixa acima da lista quando há filtro: o que está ligado, com um X para tirar cada um, e o atalho para a lista completa. */
export function ActiveFilters({ batchId, filter, shown, total }: { batchId: string; filter: ReviewFilter; shown: number; total: number }) {
  if (activeFilterCount(filter) === 0) return null;
  const chips: { key: string; label: string; exclude?: boolean; without: ReviewFilter }[] = [];

  for (const key of FILTER_GROUP_KEYS) {
    const g = filter.groups[key];
    if (!g || (!g.include.length && !g.exclude.length)) continue;
    const name = (v: string) => FILTER_GROUPS[key].options.find((o) => o.value === v)?.label ?? v;
    const parts = [g.include.map(name).join(' ou '), g.exclude.length ? `exceto ${g.exclude.map(name).join(', ')}` : ''].filter(Boolean);
    const groups = { ...filter.groups };
    delete groups[key];
    chips.push({
      key,
      label: `${FILTER_GROUPS[key].label}: ${parts.join(' · ')}`,
      exclude: !g.include.length,
      without: { ...filter, groups },
    });
  }
  for (const n of NUMBER_FILTERS) {
    const v = filter.mins[n.key];
    if (v === undefined) continue;
    const mins = { ...filter.mins };
    delete mins[n.key];
    chips.push({ key: n.key, label: `${n.label} ≥ ${String(v).replace('.', ',')}`, without: { ...filter, mins } });
  }
  if (filter.ordem !== 'pontuacao') {
    chips.push({ key: 'ordem', label: ORDER_OPTIONS.find((o) => o.value === filter.ordem)!.label, without: { ...filter, ordem: 'pontuacao' } });
  }

  return (
    <div className="mb-4 flex animate-fade-in flex-wrap items-center gap-2 rounded-lg border border-brand-border bg-brand-muted/50 px-4 py-3 text-sm">
      <span className="font-medium">{shown} de {total}</span>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={hrefFor(batchId, c.without)}
          scroll={false}
          replace
          className={`group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${c.exclude ? 'border-destructive/50 text-destructive' : 'border-brand-border bg-brand-bright/15 text-brand-pale'} animate-pop-in transition-colors hover:border-brand-border-strong`}
          aria-label={`Remover filtro ${c.label}`}
        >
          {c.label}
          <X className="size-3 opacity-60 group-hover:opacity-100" />
        </Link>
      ))}
      <Link href={`/painel/batches/${batchId}`} scroll={false} replace className="ml-auto text-muted-foreground hover:text-foreground">Ver todos</Link>
    </div>
  );
}
