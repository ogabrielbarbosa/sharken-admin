'use client';

import { looksLikeStopRequest, type ChatState } from '@lps/domain';
import { Check, Search, X } from 'lucide-react';
import Form from 'next/form';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CHAT_TABS, crmHref, FILTER_KEYS, isFollowUpDue, listTime, matchesChatFilters, type ChatRow } from '@/lib/crm';
import type { Member } from '@/lib/members';
import { AnimatedList } from './animated-list';
import { Avatar } from './avatar';
import { ChatFilter, type ConnectionOption } from './chat-filter';
import { ChatTabs } from './chat-tabs';
import { ResponsibleAvatar } from './member-avatar';
import { useChatView } from './use-chat-view';

export type ConnectionInfo = { state: 'conectado' | 'desconectado' | 'conectando' | null; phone: string | null };

function Disconnected({ connection }: { connection: ConnectionInfo }) {
  if (connection.state === 'conectado') return null;
  const connecting = connection.state === 'conectando';
  return (
    <Link href="/painel/configuracoes?aba=whatsapp" className={`mx-3 mt-3 flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-xs ${connecting ? 'bg-warning-subtle text-warning' : 'bg-destructive-subtle text-destructive'}`}>
      <span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${connecting ? 'bg-warning' : 'bg-destructive'}`} />{connecting ? 'WhatsApp conectando…' : 'WhatsApp desconectado'}</span>
      <span className="font-medium underline-offset-2 hover:underline">{connecting ? 'Ver' : 'Conectar'}</span>
    </Link>
  );
}

function Preview({ contact, now }: { contact: ChatRow; now: Date }) {
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

/** Conexões já usadas e, para cada uma, as conversas com envio por ela. */
export type ConnectionUse = { connections: ConnectionOption[]; byConnection: Record<string, string[]> };

/** Vem depois da lista: não segura a tela. Enquanto a nova não chega, vale a anterior. */
function useConnectionUse(promise: Promise<ConnectionUse>) {
  const [use, setUse] = useState<ConnectionUse | null>(null);
  useEffect(() => {
    let live = true;
    void promise.then((v) => { if (live) setUse(v); });
    return () => { live = false; };
  }, [promise]);
  return useMemo(() => {
    const byContact = new Map<string, string[]>();
    for (const [phone, ids] of Object.entries(use?.byConnection ?? {})) for (const id of ids) byContact.set(id, [...(byContact.get(id) ?? []), phone]);
    return { connections: use?.connections ?? [], byContact, ready: !!use };
  }, [use]);
}

export function ContactList({ contacts, counts, selectedId, connectionUse, now, connection, members }: {
  /** Todas as abas (ou o resultado da busca). Aba e filtros são aplicados aqui, sem ir ao servidor. */
  contacts: ChatRow[];
  counts: Record<ChatState, number>;
  selectedId: string | null;
  connectionUse: Promise<ConnectionUse>;
  now: Date;
  connection: ConnectionInfo;
  members: Member[];
}) {
  const { view: { tab, filters }, change, search } = useChatView();
  const { connections, byContact, ready } = useConnectionUse(connectionUse);
  const matching = useMemo(
    () => contacts.filter((c) => matchesChatFilters(c, ready ? filters : { ...filters, conexao: [] }, { current: connection.phone, byContact })),
    [contacts, filters, ready, byContact, connection.phone],
  );
  const shown = search ? matching : matching.filter((c) => c.chat_state === tab);
  const filtered = FILTER_KEYS.some((k) => filters[k].length > 0);
  const shownCounts = filtered ? { aberto: 0, pendente: 0, fechado: 0 } : counts;
  if (filtered) for (const c of matching) shownCounts[c.chat_state]++;
  return (
    <section aria-label="Conversas" className="flex min-h-0 flex-col border-r border-border">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3">
      <Form action="/painel/crm" className="relative min-w-0 flex-1">
        <input type="hidden" name="aba" value={tab} />
        {FILTER_KEYS.map((k) => filters[k].length > 0 && <input key={k} type="hidden" name={k} value={filters[k].join(',')} />)}
        {selectedId && <input type="hidden" name="contato" value={selectedId} />}
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input key={search} name="q" defaultValue={search} placeholder="Buscar nome ou telefone" aria-label="Buscar nome ou telefone" className="h-9 w-full rounded-lg border border-transparent bg-secondary pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-neutral-500" />
        {search && <Link href={crmHref(tab, { filters, contato: selectedId ?? undefined })} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>}
      </Form>
        <ChatFilter filters={filters} onChange={(next) => change({ filters: next })} connections={connections} members={members} />
      </div>

      <Disconnected connection={connection} />

      {!search && <ChatTabs tab={tab} counts={shownCounts} onChange={(next) => change({ tab: next })} />}
      {search && <p className="px-6 py-3 text-xs text-muted-foreground">{shown.length} resultado{shown.length === 1 ? '' : 's'} {filtered ? 'com os filtros' : 'em todas as conversas'}</p>}

      <AnimatedList view={search ? 'busca' : tab} index={CHAT_TABS.findIndex((t) => t.key === tab)} keepId={selectedId} className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3 [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin]">
        {shown.length === 0 && (
          <li data-empty="" className="animate-fade-in px-6 py-12 text-center text-sm text-muted-foreground">
            {filtered ? 'Nenhuma conversa com esses filtros.' : search ? 'Nenhum contato encontrado.' : tab === 'pendente' ? 'Nenhum atendimento pendente.' : tab === 'aberto' ? 'Nenhum atendimento aberto.' : 'Nenhum atendimento fechado.'}
          </li>
        )}
        {shown.map((c) => {
          const responsible = members.find((m) => m.id === c.responsible_id);
          const selected = c.id === selectedId;
          return (
            <li key={c.id} data-id={c.id}>
              <Link
                href={crmHref(search ? c.chat_state : tab, { contato: c.id, q: search, filters })}
                aria-current={selected ? 'true' : undefined}
                className={`mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${selected ? 'bg-accent' : 'hover:bg-accent/50'}`}
              >
                <Avatar name={c.name} src={c.avatar_url} seed={c.id} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread_count ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread_count ? 'font-medium text-success-foreground' : 'text-muted-foreground'}`}>{listTime(c.last_message_at ?? c.created_at, now)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <Preview contact={c} now={now} />
                    <span className="flex shrink-0 items-center gap-1.5">
                    {c.unread_count > 0 && <span aria-label={`${c.unread_count} não lidas`} className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success px-1.5 text-[11px] font-semibold text-background">{c.unread_count > 99 ? '99+' : c.unread_count}</span>}
                    {responsible && <ResponsibleAvatar member={responsible} />}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </AnimatedList>
    </section>
  );
}
