'use client';

import { Popover } from '@base-ui/react/popover';
import { Check, ListFilter } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';
import { FILTER_KEYS, STATUS_LABEL, TONE_DOT, type ChatFilters } from '@/lib/crm';
import type { Member } from '@/lib/members';
import { MemberAvatar } from './member-avatar';

export type ConnectionOption = { value: string; label: string; phone: string; current: boolean };

const EMPTY: ChatFilters = { conexao: [], responsavel: [], status: [] };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="border-b border-border p-1.5 last:border-b-0">
      <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Option({ checked, onToggle, icon, label, hint }: { checked: boolean; onToggle: () => void; icon?: ReactNode; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-8 w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1 text-left text-[13px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
    >
      <span aria-hidden className={cx('grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors', checked ? 'border-brand bg-brand text-brand-foreground' : 'border-border-strong')}>
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{hint}</span>}
    </button>
  );
}

/** Filtros da lista de conversas. Cada escolha já aplica. */
export function ChatFilter({ filters, onChange, connections, members }: {
  filters: ChatFilters;
  onChange: (next: ChatFilters) => void;
  connections: ConnectionOption[];
  members: Member[];
}) {
  const count = FILTER_KEYS.reduce((n, k) => n + filters[k].length, 0);
  const option = (k: keyof ChatFilters, value: string) => {
    const checked = filters[k].includes(value);
    return { checked, onToggle: () => onChange({ ...filters, [k]: checked ? filters[k].filter((v) => v !== value) : [...filters[k], value].sort() }) };
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={count ? `Filtrar conversas (${count} ativo${count === 1 ? '' : 's'})` : 'Filtrar conversas'}
        data-tip="Filtrar"
        className={cx(
          'press relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
          count ? 'bg-brand-muted text-brand-soft' : 'bg-secondary text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
        )}
      >
        <ListFilter className="size-4" />
        {count > 0 && <span aria-hidden className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-foreground ring-2 ring-background">{count}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-[1100]">
          <Popover.Popup className="flex max-h-(--available-height) w-72 origin-(--transform-origin) flex-col overflow-hidden rounded-lg border border-border-strong bg-card text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-150 ease-(--ease-out-expo) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
              <Popover.Title className="text-sm font-medium">Filtros</Popover.Title>
              {count > 0 && <button type="button" onClick={() => onChange(EMPTY)} className="cursor-pointer rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground">Limpar</button>}
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin]">
              {connections.length > 0 && (
                <Group title="Conexão">
                  {connections.map((c) => (
                    <Option key={c.value} {...option('conexao', c.value)} label={c.label} hint={c.label === c.phone ? undefined : c.phone} icon={<span aria-hidden className={cx('size-2 shrink-0 rounded-full', c.current ? 'bg-success' : 'bg-neutral-500')} />} />
                  ))}
                </Group>
              )}
              <Group title="Responsável">
                {members.map((m) => <Option key={m.id} {...option('responsavel', m.id)} label={m.name} icon={<MemberAvatar member={m} size={20} />} />)}
              </Group>
              <Group title="Status">
                {Object.entries(STATUS_LABEL).map(([value, s]) => (
                  <Option key={value} {...option('status', value)} label={s.label} icon={<span aria-hidden className={cx('size-2 shrink-0 rounded-full', TONE_DOT[s.tone])} />} />
                ))}
              </Group>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
