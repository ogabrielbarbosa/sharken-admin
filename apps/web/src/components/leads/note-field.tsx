'use client';

import { useState } from 'react';
import { saveNotesAction } from '@/lib/common-lead-actions';
import { Input } from '@/components/ui';

export function NoteField({ leadId, field, initial, placeholder, label, save }: {
  leadId: string; field: 'comment' | 'reason'; initial: string | null; placeholder: string; label?: string;
  /** Ação própria de gravação, para telas que validam a etapa do lead. */
  save?: (leadId: string, field: 'comment' | 'reason', value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const input = (
    <Input
      aria-label={label ?? placeholder}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (value === saved) return;
        if (save) await save(leadId, field, value);
        else await saveNotesAction(leadId, { [field]: value });
        setSaved(value);
      }}
    />
  );
  if (!label) return input;
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {input}
    </label>
  );
}
