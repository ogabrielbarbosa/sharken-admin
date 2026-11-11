'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui';
import { addTextAction } from '@/app/painel/batches/[id]/actions';

/** Notas para a página: salva ao sair do campo. */
export function NotesAssetField({ leadId, initial }: { leadId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">Notas para a página</span>
      <Textarea
        rows={4}
        value={value}
        placeholder="Horários, diferenciais, o que a página precisa dizer…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          if (value === saved) return;
          await addTextAction(leadId, value);
          setSaved(value);
        }}
      />
    </label>
  );
}
