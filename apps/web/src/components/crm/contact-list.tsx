import { looksLikeStopRequest, type Contact } from '@lps/domain';
import type { CrmBox } from '@lps/db';
import Link from 'next/link';
import { isFollowUpDue, listTime, STATUS_LABEL } from '@/lib/crm';
import { ConnectionBadge, type ConnectionState } from './connection-badge';

const BOXES: { key: CrmBox; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'novos', label: 'Novos' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'em_conversa', label: 'Em conversa' },
  { key: 'fechados', label: 'Fechados' },
  { key: 'perdidos', label: 'Perdidos' },
  { key: 'todos', label: 'Todos' },
];

const DOT = { neutral: 'bg-neutral-500', success: 'bg-success', danger: 'bg-destructive', warning: 'bg-warning' } as const;

function href(box: CrmBox, extra: { contato?: string; q?: string }) {
  const p = new URLSearchParams({ caixa: box });
  if (extra.q) p.set('q', extra.q);
  if (extra.contato) p.set('contato', extra.contato);
  return `/painel/crm?${p}`;
}

function Line({ contact, now }: { contact: Contact; now: Date }) {
  const stoppedAsking = contact.last_inbound_at && contact.last_inbound_at === contact.last_message_at && contact.last_message_preview && looksLikeStopRequest(contact.last_message_preview);
  const { label, tone } = stoppedAsking
    ? { label: 'Pediu para parar', tone: 'danger' as const }
    : isFollowUpDue(contact, now)
      ? { label: 'Follow-up', tone: 'warning' as const }
      : contact.origin === 'whatsapp_direto' && contact.status === 'em_conversa'
        ? { label: 'WhatsApp direto', tone: 'neutral' as const }
        : STATUS_LABEL[contact.status];
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${DOT[tone]}`} />{label}
    </p>
  );
}

export function ContactList({ contacts, counts, box, selectedId, search, now, connection, firstToday, dailyLimit }: {
  contacts: Contact[];
  counts: Record<CrmBox, number>;
  box: CrmBox;
  selectedId: string | null;
  search: string;
  now: Date;
  connection: ConnectionState;
  firstToday: number;
  dailyLimit: number;
}) {
  const pct = Math.min(100, Math.round((firstToday / dailyLimit) * 100));
  return (
    <section aria-label="Conversas" className="flex min-h-0 flex-col border-r border-border">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-semibold">Conversas</h1>
          <ConnectionBadge state={connection} href={`${href(box, { contato: selectedId ?? undefined, q: search })}&conexao=1`} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">Primeiros contatos hoje</span>
          <div className="h-1 min-w-8 flex-1 rounded-full bg-secondary" role="progressbar" aria-valuenow={firstToday} aria-valuemax={dailyLimit}>
            <div className={`h-full rounded-full ${firstToday >= dailyLimit ? 'bg-warning' : 'bg-foreground'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="whitespace-nowrap font-mono text-foreground">{firstToday} de {dailyLimit}</span>
        </div>
        <form action="/painel/crm">
          <input type="hidden" name="caixa" value={box} />
          <input name="q" defaultValue={search} placeholder="Buscar nome ou telefone" aria-label="Buscar nome ou telefone" className="h-9 w-full rounded-md border border-input bg-input-bg px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-neutral-400" />
        </form>
        <nav className="flex flex-wrap gap-1.5" aria-label="Caixas">
          {BOXES.map((b) => (
            <Link key={b.key} href={href(b.key, { q: search })} aria-current={b.key === box ? 'page' : undefined} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${b.key === box ? 'bg-foreground text-background' : 'bg-secondary text-foreground hover:bg-neutral-700'}`}>
              {b.label}<span className={b.key === box ? 'opacity-60' : 'text-muted-foreground'}>{counts[b.key] ?? 0}</span>
            </Link>
          ))}
        </nav>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {contacts.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{search ? 'Nenhum contato encontrado.' : 'Nenhum contato nesta caixa.'}</li>}
        {contacts.map((c) => (
          <li key={c.id}>
            <Link href={href(box, { contato: c.id, q: search })} aria-current={c.id === selectedId ? 'true' : undefined} className={`flex gap-3 border-b border-border px-4 py-3 hover:bg-accent/60 ${c.id === selectedId ? 'bg-accent' : ''}`}>
              <span className="size-9 shrink-0 rounded-full bg-gradient-to-br from-sky-500 to-emerald-300" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread_count ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{listTime(c.last_message_at, now)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-foreground/80">{c.last_message_preview ?? 'Pronto para o primeiro contato'}</span>
                  {c.unread_count > 0 && <span aria-label={`${c.unread_count} não lidas`} className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-xs font-semibold text-background">{c.unread_count}</span>}
                </span>
                <Line contact={c} now={now} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
