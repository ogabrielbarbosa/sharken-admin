'use client';

import { ExternalLink, Link2, Pencil } from 'lucide-react';
import { useState, useTransition } from 'react';
import { updateContactLinkAction } from '@/app/painel/crm/actions';
import { Button, ErrorNote } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { Section } from './panel-parts';

export type LinksInfo = { page: string | null; loom: string | null };

function LinkRow({ contactId, kind, label, url }: { contactId: string; kind: 'pagina' | 'video'; label: string; url: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? '');
  const [note, setNote] = useState<{ error?: string; warning?: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const out = await updateContactLinkAction(contactId, kind, value);
    if (out.ok) { setEditing(false); setNote('warning' in out && out.warning ? { warning: out.warning as string } : null); }
    else setNote({ error: out.error });
  });
  const open = editing || !url;
  return (
    <div className="mx-2 mt-1 space-y-1.5 rounded-lg border border-border p-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {open ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input aria-label={`Link ${label}`} value={value} disabled={pending} placeholder="Cole o link" onChange={(e) => setValue(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-input-bg px-2 text-xs outline-none placeholder:text-muted-foreground" />
          <Button type="submit" variant="outline" disabled={pending || !value.trim()}>Salvar</Button>
        </form>
      ) : (
        <>
          <p className="break-all font-mono text-xs">{url.replace(/^https?:\/\//, '')}</p>
          <div className="flex flex-wrap gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-input-bg px-3 text-sm font-medium hover:bg-accent [&_svg]:size-4"><ExternalLink />Abrir</a>
            <CopyButton text={url} />
            <Button variant="outline" onClick={() => { setValue(url); setEditing(true); }}><Pencil />Editar</Button>
          </div>
        </>
      )}
      {note?.error && <ErrorNote>{note.error}</ErrorNote>}
      {note?.warning && <p className="text-xs text-warning">{note.warning}</p>}
    </div>
  );
}

export function LinksBlock({ contactId, links }: { contactId: string; links: LinksInfo }) {
  return (
    <Section icon={<Link2 />} title="Links">
      <LinkRow contactId={contactId} kind="pagina" label="Página" url={links.page} />
      <LinkRow contactId={contactId} kind="video" label="Loom" url={links.loom} />
    </Section>
  );
}
