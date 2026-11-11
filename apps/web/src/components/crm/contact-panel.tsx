'use client';

import type { Contact, Lead } from '@lps/domain';
import { Ban, Handshake, History, Layers, Target, ThumbsDown } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { saveLeadCommentAction, setStatusAction } from '@/app/painel/crm/actions';
import { ErrorNote } from '@/components/ui';
import { FollowUpBlock } from './follow-up-block';
import { LinksBlock } from './links-block';
import { Row, Section } from './panel-parts';

export type HistoryItem = { at: string; label: string };
export type PanelProps = {
  contact: Contact;
  lead: Lead | null;
  origin: { label: string; href: string | null };
  flowLabel: string | null;
  history: HistoryItem[];
  closeHref: string;
};

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

function LeadComment({ contactId, initial }: { contactId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <textarea
        aria-label="Comentário interno"
        rows={2}
        value={value}
        placeholder="Comentário interno"
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value.trim() !== initial.trim()) start(async () => { const out = await saveLeadCommentAction(contactId, value); setError(out.ok ? null : out.error); }); }}
        className="w-full resize-none rounded-md border border-input bg-input-bg px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function ContactPanel({ contact, lead, origin, flowLabel, history, closeHref }: PanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ended = contact.status === 'nao_contatar';
  const change = (to: 'perdido' | 'nao_contatar', question: string) => {
    if (!window.confirm(question)) return;
    start(async () => { const out = await setStatusAction(contact.id, to); setError(out.ok ? null : out.error); });
  };
  return (
    <aside aria-label="Contato" className="flex min-h-0 flex-col border-l border-border">
      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4 py-4">
        <div className="pb-3">
          <h2 className="text-sm font-semibold">{contact.name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="size-3.5" />
            {origin.href ? <Link href={origin.href} className="hover:text-foreground hover:underline">{origin.label} ↗</Link> : origin.label}
          </p>
        </div>

        {lead && <LinksBlock key={`${lead.page_url}|${lead.loom_url}`} contactId={contact.id} links={{ page: lead.page_url, loom: lead.loom_url }} />}

        {lead && (
          <Section icon={<Target />} title="Lead">
            {flowLabel && <Row label="Fluxo">{flowLabel}</Row>}
            {lead.score !== null && <Row label="Pontuação">{lead.score} / 100</Row>}
            {lead.reason && <p className="text-xs italic text-muted-foreground">“{lead.reason}”</p>}
            <LeadComment contactId={contact.id} initial={lead.comment ?? ''} />
          </Section>
        )}

        <FollowUpBlock key={`${contact.follow_up_at}|${contact.follow_up_note}`} contactId={contact.id} at={contact.follow_up_at} note={contact.follow_up_note} disabled={ended} />

        <Section icon={<History />} title="Histórico">
          {history.length === 0 && <p className="text-xs text-muted-foreground">Nada registrado ainda.</p>}
          <ul className="space-y-1.5">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-foreground" /><span className="truncate">{h.label}</span></span>
                <span className="shrink-0 text-muted-foreground">{when(h.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="space-y-2 border-t border-border p-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {ended ? (
          <span className="flex h-9 items-center justify-center gap-2 rounded-md bg-secondary text-sm font-medium opacity-60"><Handshake className="size-4" />Fechar negócio</span>
        ) : (
          <Link href={closeHref} scroll={false} className="flex h-9 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-white"><Handshake className="size-4" />{contact.status === 'fechado' ? 'Novo negócio' : 'Fechar negócio'}</Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending || ended || contact.status === 'perdido'} onClick={() => change('perdido', 'Marcar este contato como perdido?')} className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><ThumbsDown className="size-4" />Perdido</button>
          <button type="button" disabled={pending || ended} onClick={() => change('nao_contatar', 'Marcar como Não contatar? Isso é permanente e bloqueia o envio para este número.')} className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><Ban className="size-4" />Não contatar</button>
        </div>
      </footer>
    </aside>
  );
}
