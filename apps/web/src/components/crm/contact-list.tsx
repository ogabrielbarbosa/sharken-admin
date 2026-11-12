import { looksLikeStopRequest, type ChatState, type Contact } from '@lps/domain';
import type { ChatCounts } from '@lps/db';
import { Check, Search, X } from 'lucide-react';
import Link from 'next/link';
import { crmHref, isFollowUpDue, listTime } from '@/lib/crm';
import { Avatar } from './avatar';

export const TABS: { key: ChatState; label: string }[] = [
  { key: 'aberto', label: 'Abertos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'fechado', label: 'Fechados' },
];


export type ConnectionInfo = { state: 'conectado' | 'desconectado' | 'conectando' | null; phone: string | null };

function Disconnected({ connection }: { connection: ConnectionInfo }) {
  if (connection.state === 'conectado') return null;
  const connecting = connection.state === 'conectando';
  return (
    <Link href="/painel/crm/conexoes" className={`mx-3 mt-3 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs ${connecting ? 'bg-warning-subtle text-warning' : 'bg-destructive-subtle text-destructive'}`}>
      <span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${connecting ? 'bg-warning' : 'bg-destructive'}`} />{connecting ? 'WhatsApp conectando…' : 'WhatsApp desconectado'}</span>
      <span className="font-medium underline-offset-2 hover:underline">{connecting ? 'Ver' : 'Conectar'}</span>
    </Link>
  );
}

function Preview({ contact, now }: { contact: Contact; now: Date }) {
  const outbound = !!contact.last_message_at && contact.last_outbound_at === contact.last_message_at;
  const stop = !outbound && contact.last_message_preview && looksLikeStopRequest(contact.last_message_preview);
  const followUp = isFollowUpDue(contact, now);
  return (
    <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
      {/* Só indica que a última foi sua: a lista não sabe o status dela, e não há leitura. */}
      {outbound && <Check className="size-3.5 shrink-0 text-muted-foreground" aria-label="Você enviou" />}
      {stop && <span className="shrink-0 rounded-sm bg-destructive-subtle px-1 text-[10px] font-medium text-destructive">Pediu para parar</span>}
      {followUp && !stop && <span className="shrink-0 rounded-sm bg-warning-subtle px-1 text-[10px] font-medium text-warning">Follow-up</span>}
      <span className={`truncate ${contact.unread_count ? 'text-foreground' : ''}`}>{contact.last_message_preview ?? (contact.status === 'novo' ? 'Pronto para o primeiro contato' : 'Sem mensagens')}</span>
    </span>
  );
}

export function ContactList({ contacts, counts, tab, selectedId, search, now, connection }: {
  contacts: Contact[];
  counts: ChatCounts;
  tab: ChatState;
  selectedId: string | null;
  search: string;
  now: Date;
  connection: ConnectionInfo;
}) {
  return (
    <section aria-label="Conversas" className="flex min-h-0 flex-col border-r border-border">
      <Disconnected connection={connection} />

      <form action="/painel/crm" className="relative mx-3 mb-3 mt-3">
        <input type="hidden" name="aba" value={tab} />
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={search} placeholder="Buscar nome ou telefone" aria-label="Buscar nome ou telefone" className="h-9 w-full rounded-lg border border-transparent bg-secondary pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-neutral-500" />
        {search && <Link href={crmHref(tab)} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>}
      </form>

      {!search && (
        <nav className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1" aria-label="Estado do atendimento">
          {TABS.map((t) => {
            const active = t.key === tab;
            const n = counts[t.key] ?? 0;
            const alert = t.key === 'pendente' && n > 0;
            return (
              <Link key={t.key} href={crmHref(t.key)} aria-current={active ? 'page' : undefined} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {t.label}
                <span className={`min-w-5 rounded-full px-1.5 text-center text-[10px] leading-4 ${alert ? 'bg-success text-background' : active ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}>{n}</span>
              </Link>
            );
          })}
        </nav>
      )}
      {search && <p className="px-4 pb-2 text-xs text-muted-foreground">{contacts.length} resultado{contacts.length === 1 ? '' : 's'} em todas as conversas</p>}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {contacts.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-muted-foreground">
            {search ? 'Nenhum contato encontrado.' : tab === 'pendente' ? 'Nenhum atendimento pendente.' : tab === 'aberto' ? 'Nenhum atendimento aberto.' : 'Nenhum atendimento fechado.'}
          </li>
        )}
        {contacts.map((c) => {
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <Link
                href={crmHref(search ? c.chat_state : tab, { contato: c.id, q: search })}
                aria-current={selected ? 'true' : undefined}
                className={`mx-1.5 flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors ${selected ? 'bg-accent' : 'hover:bg-accent/50'}`}
              >
                <Avatar name={c.name} src={c.avatar_url} seed={c.id} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread_count ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread_count ? 'font-medium text-success-foreground' : 'text-muted-foreground'}`}>{listTime(c.last_message_at ?? c.created_at, now)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <Preview contact={c} now={now} />
                    {c.unread_count > 0 && <span aria-label={`${c.unread_count} não lidas`} className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-semibold text-background">{c.unread_count > 99 ? '99+' : c.unread_count}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
