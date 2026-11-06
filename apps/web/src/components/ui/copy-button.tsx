'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './index';

export function CopyButton({ text, label = 'Copiar', disabled }: { text: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}{copied ? 'Copiado' : label}
    </Button>
  );
}
