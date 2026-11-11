import { getEnv } from '@lps/config';
import {
  clientByContact,
  FOLLOW_UP_LIMIT_MESSAGE,
  countBoxes,
  firstContactsToday,
  getBatch,
  getContact,
  getLead,
  listContacts,
  listEvents,
  listMessages,
  markStalePending,
  outreachCount,
  type CrmBox,
} from '@lps/db';
import { closeDealDefaults, firstContactText, followUpText, outreachKind, phoneMatchCandidates, sendBlockReason, type Contact, type CloseDealInput } from '@lps/domain';
import { MessageCircle } from 'lucide-react';
import { ReconnectDrawer } from '@/components/crm/reconnect-drawer';
import { ConnectionBadge } from '@/components/crm/connection-badge';
import { CloseDealDrawer } from '@/components/crm/close-deal-drawer';
import { ContactList } from '@/components/crm/contact-list';
import { ContactPanel, type HistoryItem } from '@/components/crm/contact-panel';
import { Conversation } from '@/components/crm/conversation';
import type { Template } from '@/components/crm/composer';
import type { LegacyLine, ThreadMessage } from '@/components/crm/thread';
import { CrmRealtime } from '@/components/crm/use-crm-realtime';
import { Topbar } from '@/components/layout/topbar';
import { authedDb } from '@/lib/auth';
import { composerDraft, eventLabel, stopRequestPending } from '@/lib/crm';
import { flowLabel } from '@/lib/lead-labels';

const BOXES: CrmBox[] = ['hoje', 'novos', 'aguardando', 'em_conversa', 'fechados', 'perdidos', 'todos'];
type Params = { caixa?: string; contato?: string; texto?: string; q?: string; conexao?: string; fechar?: string };

async function mediaUrls(db: Awaited<ReturnType<typeof authedDb>>, messages: ThreadMessage[]) {
  const paths = messages.map((m) => m.media_path).filter((p): p is string => !!p);
  if (!paths.length) return new Map<string, string>();
  const { data } = await db.storage.from('whatsapp-media').createSignedUrls(paths, 24 * 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

export default async function CrmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const box = BOXES.find((b) => b === params.caixa) ?? 'hoje';
  const search = params.q?.trim() ?? '';
  const db = await authedDb();
  const env = getEnv();
  const now = new Date();

  await markStalePending(db, new Date(now.getTime() - 2 * 60_000));
  const [contacts, counts, firstToday, connectionRow, selected] = await Promise.all([
    listContacts(db, { box, search }),
    countBoxes(db),
    firstContactsToday(db, now),
    db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle(),
    params.contato ? getContact(db, params.contato) : Promise.resolve(null),
  ]);
  const connection = (connectionRow.data?.state as 'conectado' | 'desconectado' | 'conectando' | undefined) ?? null;
  const base = `/painel/crm?caixa=${box}${search ? `&q=${encodeURIComponent(search)}` : ''}`;
  const dailyLimit = env.DAILY_FIRST_CONTACT_LIMIT;

  const list = (
    <ContactList contacts={contacts} counts={counts} box={box} selectedId={selected?.id ?? null} search={search} now={now} connection={connection} firstToday={firstToday} dailyLimit={dailyLimit} />
  );
  const shell = (children: React.ReactNode) => (
    <div className="flex h-[calc(100vh-1rem)] flex-col max-lg:h-screen">
      <Topbar crumbs={[{ label: 'CRM' }]} />
      <CrmRealtime contactId={selected?.id ?? null} />
      {params.conexao && connection !== 'conectado' && <ReconnectDrawer closeHref={base + (selected ? `&contato=${selected.id}` : '')} />}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">{children}</div>
    </div>
  );
  const listCol = (hide: boolean) => <div className={`flex min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1 ${hide ? 'max-lg:hidden' : ''}`}>{list}</div>;

  if (!selected) {
    return shell(
      <>
        {listCol(false)}
        <div className="col-span-full hidden min-h-0 flex-col items-center justify-center gap-2 text-center lg:col-span-1 lg:flex xl:col-span-2">
          <MessageCircle className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">Escolha uma conversa</p>
          <p className="max-w-xs text-xs text-muted-foreground">Cada envio é um clique seu. Nada sai sozinho.</p>
          <ConnectionBadge state={connection} href={`${base}&conexao=1`} />
        </div>
      </>,
    );
  }

  const closing = params.fechar === '1' && selected.status !== 'nao_contatar';
  const [lead, messages, dnc, existingClient] = await Promise.all([
    selected.lead_id ? getLead(db, selected.lead_id) : null,
    listMessages(db, selected.id, 200),
    db.from('do_not_contact').select('phone_e164').in('phone_e164', phoneMatchCandidates(selected.phone_e164)).limit(1),
    closing ? clientByContact(db, selected.id) : null,
  ]);
  const [events, batch, urls] = await Promise.all([
    selected.lead_id ? listEvents(db, selected.lead_id) : [],
    selected.batch_id ? getBatch(db, selected.batch_id) : null,
    mediaUrls(db, messages as ThreadMessage[]),
  ]);

  const link = lead?.page_url ?? null;

  const threadMessages: ThreadMessage[] = messages.map((m) => ({ ...m, mediaUrl: m.media_path ? (urls.get(m.media_path) ?? null) : null }));
  const firstAt = messages[0]?.at;
  const legacy: LegacyLine[] = firstAt
    ? events.filter((e) => e.created_at < firstAt && e.type !== 'abertura').flatMap((e) => { const label = eventLabel(e); return label ? [{ at: e.created_at, label }] : []; }).reverse().slice(-12)
    : [];
  const history: HistoryItem[] = events.flatMap((e) => { const label = eventLabel(e); return label ? [{ at: e.created_at, label }] : []; }).slice(0, 8);

  const templates: Template[] = [];
  if (lead && link) {
    try { templates.push({ label: 'Primeiro contato', text: firstContactText(lead, link) }); } catch { /* lead sem campo da mensagem */ }
    templates.push({ label: 'Follow-up', text: followUpText(link) });
  }

  const blockReason = sendBlockReason(selected as Contact, { doNotContact: !!dnc.data?.length, connected: connection !== 'desconectado', kind: 'normal' })
    ?? (outreachKind(selected.status, !!selected.responded_at, await outreachCount(db, selected as Contact)) === 'bloqueado' ? FOLLOW_UP_LIMIT_MESSAGE : null);
  const flow = lead ? flowLabel(lead).label : null;
  const origin = selected.origin === 'batch'
    ? { label: batch ? `Batch ${batch.location} · ${batch.business_type}` : 'Batch', href: batch ? `/painel/batches/${batch.id}` : null }
    : { label: selected.origin === 'whatsapp_direto' ? 'WhatsApp direto' : 'Contato manual', href: null };

  let closeDefaults: CloseDealInput | null = null;
  if (closing) {
    closeDefaults = closeDealDefaults(selected, lead);
    if (existingClient) {
      closeDefaults.client = {
        legal_name: existingClient.legal_name, document: existingClient.document, contact_name: existingClient.contact_name ?? '',
        email: existingClient.email ?? '', phone: existingClient.phone ?? closeDefaults.client.phone,
        address: existingClient.address ?? '', location: existingClient.location ?? closeDefaults.client.location,
      };
    }
  }

  return shell(
    <>
      {closeDefaults && <CloseDealDrawer contactName={selected.name} defaults={closeDefaults} existingClient={!!existingClient} closeHref={`${base}&contato=${selected.id}`} />}
      {listCol(true)}
      <div className="flex min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1">
        <Conversation
          key={selected.id}
          contact={selected}
          messages={threadMessages}
          legacy={legacy}
          now={now}
          draft={composerDraft({ contact: selected, lead, link, texto: params.texto, now })}
          templates={templates}
          blockReason={blockReason}
          backHref={base}
          stopRequest={stopRequestPending(messages)}
          dailyCount={firstToday}
          dailyLimit={dailyLimit}
        />
      </div>
      <div className="hidden min-h-0 flex-col xl:flex [&>*]:min-h-0 [&>*]:flex-1">
        <ContactPanel
          contact={selected}
          lead={lead}
          origin={origin}
          flowLabel={flow}
          history={history}
          closeHref={`${base}&contato=${selected.id}&fechar=1`}
        />
      </div>
    </>,
  );
}
