import { QUICK_REPLIES } from '@lps/config';
import {
  clientByContact,
  FOLLOW_UP_LIMIT_MESSAGE,
  countChats,
  firstContactsToday,
  getBatch,
  getContact,
  getLead,
  listChats,
  listEvents,
  listMessages,
  markStalePending,
  outreachCount,
} from '@lps/db';
import { closeDealDefaults, firstContactText, followUpText, outreachKind, phoneMatchCandidates, sendBlockReason, type ChatState, type Contact, type CloseDealInput } from '@lps/domain';
import { MessageCircle } from 'lucide-react';
import { AvatarRefresher } from '@/components/crm/avatar-refresher';
import { CloseDealDrawer } from '@/components/crm/close-deal-drawer';
import { ContactList, type ConnectionInfo } from '@/components/crm/contact-list';
import { ContactPanel, type HistoryItem } from '@/components/crm/contact-panel';
import { Conversation } from '@/components/crm/conversation';
import type { Template, Variable } from '@/components/crm/composer';
import type { LegacyLine, ThreadMessage } from '@/components/crm/thread';
import { NewContactDialog } from '@/components/crm/new-contact-dialog';
import { CrmRealtime } from '@/components/crm/use-crm-realtime';
import { Topbar } from '@/components/layout/topbar';
import { authedDb, getSession, workspaceProfile } from '@/lib/auth';
import { composerDraft, crmHref, duration, eventLabel, stopRequestPending } from '@/lib/crm';
import { flowLabel } from '@/lib/lead-labels';

const TABS: ChatState[] = ['aberto', 'pendente', 'fechado'];
type Params = { aba?: string; contato?: string; texto?: string; q?: string; fechar?: string };

async function mediaUrls(db: Awaited<ReturnType<typeof authedDb>>, messages: ThreadMessage[]) {
  const paths = messages.map((m) => m.media_path).filter((p): p is string => !!p);
  if (!paths.length) return new Map<string, string>();
  const { data } = await db.storage.from('whatsapp-media').createSignedUrls(paths, 24 * 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

export default async function CrmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = TABS.find((t) => t === params.aba) ?? 'aberto';
  const search = params.q?.trim() ?? '';
  const db = await authedDb();
  const now = new Date();

  await markStalePending(db, new Date(now.getTime() - 2 * 60_000));
  const [contacts, counts, firstToday, connectionRow, selected] = await Promise.all([
    listChats(db, { state: search ? null : tab, search }),
    countChats(db),
    firstContactsToday(db, now),
    db.from('whatsapp_connection').select('state, phone, profile_pic_url').maybeSingle(),
    params.contato ? getContact(db, params.contato) : Promise.resolve(null),
  ]);
  const connectionInfo: ConnectionInfo = {
    state: (connectionRow.data?.state as ConnectionInfo['state'] | undefined) ?? null,
    phone: (connectionRow.data?.phone as string | null | undefined) ?? null,
  };
  const connection = connectionInfo.state;
  const base = crmHref(tab, { q: search });
  const profile = workspaceProfile((await getSession()).workspace);
  const dailyLimit = profile.dailyLimit;

  const list = (
    <ContactList contacts={contacts} counts={counts} tab={tab} selectedId={selected?.id ?? null} search={search} now={now} connection={connectionInfo} />
  );
  const shell = (children: React.ReactNode) => (
    <div className="flex h-[calc(100vh-1rem)] flex-col max-lg:h-screen">
      <Topbar crumbs={[{ label: 'Atendimento' }, { label: 'Conversas' }]} actions={<NewContactDialog />} />
      <CrmRealtime contactId={selected?.id ?? null} />
      <AvatarRefresher ids={contacts.map((c) => c.id)} enabled={connection === 'conectado'} />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_320px]">{children}</div>
    </div>
  );
  const listCol = (hide: boolean) => <div className={`flex min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1 ${hide ? 'max-lg:hidden' : ''}`}>{list}</div>;

  if (!selected) {
    return shell(
      <>
        {listCol(false)}
        <div className="col-span-full hidden min-h-0 flex-col items-center justify-center gap-2 text-center lg:col-span-1 lg:flex xl:col-span-2">
          <span className="mb-1 rounded-full bg-secondary p-4"><MessageCircle className="size-7 text-muted-foreground" /></span>
          <p className="text-sm font-medium">{counts.pendente > 0 ? `${counts.pendente} atendimento${counts.pendente === 1 ? '' : 's'} pendente${counts.pendente === 1 ? '' : 's'}` : 'Escolha uma conversa'}</p>
          <p className="max-w-xs text-xs text-muted-foreground">Abrir um pendente passa o atendimento para Abertos. Cada envio é um clique seu.</p>
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
    try { templates.push({ label: 'Primeiro contato', text: firstContactText(lead, link, profile.signer) }); } catch { /* lead sem campo da mensagem */ }
    templates.push({ label: 'Follow-up', text: followUpText(link, profile.signer) });
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

  const phoneLabel = connectionInfo.phone ? connectionInfo.phone.replace(/^\+?55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3') : null;
  const me = { name: profile.signer, avatar: (connectionRow.data?.profile_pic_url as string | null | undefined) ?? null, phone: phoneLabel };
  const variables: Variable[] = [
    { key: 'nome', label: 'Nome do contato', value: selected.name },
    { key: 'primeiro_nome', label: 'Primeiro nome', value: selected.name.split(/\s+/)[0] ?? null },
    { key: 'telefone', label: 'Telefone', value: selected.phone_e164 },
    { key: 'link', label: 'Link da página', value: link },
    { key: 'cidade', label: 'Cidade', value: lead?.city ?? null },
    { key: 'empresa', label: 'Nome comercial', value: profile.company },
    { key: 'meu_nome', label: 'Seu nome', value: profile.signer },
  ];
  const quickReplies = QUICK_REPLIES.map((r) => ({ shortcut: r.atalho, title: r.titulo, text: r.texto }));
  // 1ª resposta: da primeira mensagem recebida até a primeira enviada depois dela.
  const firstIn = messages.find((m) => m.direction === 'entrada');
  const replyAfter = firstIn ? messages.find((m) => m.direction === 'saida' && m.at > firstIn.at) : undefined;
  const firstResponse = firstIn && replyAfter ? duration(new Date(replyAfter.at).getTime() - new Date(firstIn.at).getTime()) : null;
  const mediaMessages = threadMessages.filter((m) => m.kind !== 'texto' && m.direction !== 'nota');
  const notes = threadMessages.filter((m) => m.direction === 'nota');

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
          draft={composerDraft({ contact: selected, lead, link, texto: params.texto, now, signer: profile.signer })}
          templates={templates}
          blockReason={blockReason}
          backHref={base}
          stopRequest={stopRequestPending(messages)}
          dailyCount={firstToday}
          dailyLimit={dailyLimit}
          quickReplies={quickReplies}
          variables={variables}
          me={me}
          tab={tab}
          searching={!!search}
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
          firstResponse={firstResponse}
          media={mediaMessages}
          notes={notes}
          now={now.toISOString()}
        />
      </div>
    </>,
  );
}
