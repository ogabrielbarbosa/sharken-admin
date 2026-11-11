'use client';

import { ExternalLink, Globe, RefreshCw, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { removePageAction, renewPageAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';
import { Section } from './panel-parts';

export type PageInfo = { link: string; expiresLabel: string | null; expired: boolean; opens: number; ttlHours: number };

export function PageBlock({ contactId, page }: { contactId: string; page: PageInfo }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const out = await fn(); setError(out.ok ? null : (out.error ?? 'Algo deu errado.')); });
  return (
    <Section icon={<Globe />} title="Página">
      <div className="rounded-lg border border-border p-3">
        <p className="break-all font-mono text-xs">{page.link.replace(/^https?:\/\//, '')}</p>
        <p className={`mt-1 text-xs ${page.expired ? 'text-destructive' : 'text-warning'}`}>
          {page.expiresLabel}
          <span className="text-muted-foreground"> · aberta {page.opens} {page.opens === 1 ? 'vez' : 'vezes'}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending} onClick={() => run(() => renewPageAction(contactId))}><RefreshCw />Renovar {page.ttlHours} h</Button>
        <a href={page.link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-input-bg text-sm font-medium hover:bg-accent [&_svg]:size-4"><ExternalLink />Abrir</a>
      </div>
      <button type="button" disabled={pending} onClick={() => { if (window.confirm('Remover a página? O link deixa de funcionar.')) run(() => removePageAction(contactId)); }} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"><Trash2 className="size-3.5" />Remover página</button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </Section>
  );
}
