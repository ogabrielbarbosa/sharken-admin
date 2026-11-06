'use client';

import { useState } from 'react';
import { saveNotesAction } from '@/lib/common-lead-actions';
import { Input } from '@/components/ui';

export function NoteField({ leadId, field, initial, placeholder, label }: {
  leadId: string; field: 'comment' | 'reason'; initial: string | null; placeholder: string; label?: string;
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
        await saveNotesAction(leadId, { [field]: value });
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
