'use client';

import { ChevronDown } from 'lucide-react';
import { MemberAvatar } from '@/components/crm/member-avatar';
import { InlineSelect } from '@/components/crm/panel-parts';
import type { Member } from '@/lib/members';

const SIZE = 26;

/** Bolinha do responsável no cartão: a foto (a seta aparece no hover) ou um círculo vazio com a seta. */
export function ResponsiblePicker({ leadName, value, members, disabled, onChange }: {
  leadName: string; value: string | null; members: Member[]; disabled?: boolean; onChange: (id: string | null) => void;
}) {
  const current = members.find((m) => m.id === value);
  return (
    <span className="pointer-events-auto relative shrink-0">
      <InlineSelect
        label={`Responsável por ${leadName}: ${current?.name ?? 'ninguém'}`}
        value={current?.id ?? ''}
        options={[{ value: '', label: 'Sem responsável' }, ...members.map((m) => ({ value: m.id, label: m.name, icon: <MemberAvatar member={m} size={20} /> }))]}
        disabled={disabled}
        onChange={(id) => onChange(id || null)}
        triggerTitle={current?.name ?? 'Definir responsável'}
        trigger={
          <span style={{ width: SIZE, height: SIZE }} className={`group/pick relative flex items-center justify-center rounded-full ${current ? '' : 'border border-dashed border-neutral-500 text-muted-foreground hover:border-neutral-300 hover:text-foreground'}`}>
            {current && <MemberAvatar member={current} size={SIZE} />}
            {current
              ? <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover/pick:opacity-100 group-focus-visible/trigger:opacity-100 group-aria-expanded/trigger:opacity-100"><ChevronDown className="size-3.5" /></span>
              : <ChevronDown className="size-3.5" />}
          </span>
        }
      />
    </span>
  );
}
