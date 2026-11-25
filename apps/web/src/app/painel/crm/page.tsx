import {
  clientByContact,
  FOLLOW_UP_LIMIT_MESSAGE,
  countChats,
  contactsByConnection,
  firstContactsToday,
  getBatch,
  getContact,
  getLead,
  listChats,
  listSentConnections,
  listEvents,
  listResponsibleEvents,
  listCatalog,
  listChatLogs,
  listMessages,
  profilesOrEmpty,
  listQuickReplies,
  markStalePending,
  outreachCount,
} from '@lps/db';
import { batchName, closeDealDefaults, firstContactText, followUpText, outreachKind, phoneMatchCandidates, sendBlockReason, type Contact, type CloseDealInput } from '@lps/domain';
import { after } from 'next/server';
import { MessageCircle } from 'lucide-react';
import { AvatarRefresher } from '@/components/crm/avatar-refresher';
import { CloseDealDrawer } from '@/components/crm/close-deal-drawer';
import { ContactList, type ConnectionInfo, type ConnectionUse } from '@/components/crm/contact-list';
import { ContactPanel, type HistoryItem } from '@/components/crm/contact-panel';
import { Conversation } from '@/components/crm/conversation';
import type { Template, Variable } from '@/components/crm/composer';
import type { LegacyLine, ThreadMessage } from '@/components/crm/thread';
import { NewContactDialog } from '@/components/crm/new-contact-dialog';
import { CrmRealtime } from '@/components/crm/use-crm-realtime';
import { Topbar } from '@/components/layout/topbar';
import { authedDb, getSession, workspaceProfile } from '@/lib/auth';
import { CHAT_TABS, composerDraft, chatLogLabel, crmHref, eventLabel, formatPhone, parseChatFilters, parseChatTab, toChatRow, responsibleLabel, stopRequestPending } from '@/lib/crm';
import { listMembers } from '@/lib/members';
import { flowLabel } from '@/lib/lead-labels';

const MESSAGE_LIMIT = 200;
type Params = { aba?: string; contato?: string; texto?: string; q?: string; fechar?: string; conexao?: string; responsavel?: string; status?: string };

async function mediaUrls(db: Awaited<ReturnType<typeof authedDb>>, messages: ThreadMessage[]) {
  const paths = messages.map((m) => m.media_path).filter((p): p is string => !!p);
  if (!paths.length) return new Map<string, string>();
  const { data } = await db.storage.from('whatsapp-media').createSignedUrls(paths, 24 * 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Sem esperar na página: o filtro de conexão completa quando isto chega. */
async function loadConnectionUse(db: Awaited<ReturnType<typeof authedDb>>, phone: string | null, name: string | null): Promise<ConnectionUse> {
  const option = (c: { phone: string; name: string | null }) => ({ value: c.phone, label: c.name || formatPhone(c.phone), phone: formatPhone(c.phone), current: c.phone === phone });
  const current = phone ? [option({ phone, name })] : [];
  try {
    const sent = await listSentConnections(db);
    return {
      connections: [...current, ...sent.filter((c) => c.phone !== phone).map(option)],
      byConnection: await contactsByConnection(db, sent.map((c) => c.phone)),
    };
  } catch (err) {
    console.error('conexoes_falharam', (err as Error).message);
    return { connections: current, byConnection: {} };
  }
}

export default async function CrmPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = parseChatTab(params.aba);
  const search = params.q?.trim() ?? '';
  const db = await authedDb();
  const now = new Date();

  // Não segura a tela: se marcar alguma, o Realtime recarrega.
  after(() => markStalePending(db, new Date(now.getTime() - 2 * 60_000)).catch((err) => console.error('pendentes_falharam', (err as Error).message)));
  const { user, workspace } = await getSession();
  const [members, lists, counts, firstToday, connectionRow, selected] = await Promise.all([
    listMembers(workspace.id),
    // Todas as abas de uma vez: trocar de aba e filtrar acontece no navegador.
    Promise.all(search ? [listChats(db, { state: null, search })] : CHAT_TABS.map((t) => listChats(db, { state: t.key }))),
    countChats(db),
    firstContactsToday(db, now),
    db.from('whatsapp_connection').select('state, phone, profile_name, profile_pic_url').maybeSingle(),
    params.contato ? getContact(db, params.contato) : Promise.resolve(null),
  ]);
  const connectionInfo: ConnectionInfo = {
    state: (connectionRow.data?.state as ConnectionInfo['state'] | undefined) ?? null,
    phone: (connectionRow.data?.phone as string | null | undefined) ?? null,
  };
  const connection = connectionInfo.state;
  const contacts = lists.flat();
  const connectionUse = loadConnectionUse(db, connectionInfo.phone, (connectionRow.data?.profile_name as string | null | undefined) ?? null);
  const filters = parseChatFilters((key) => params[key]);
  const profile = workspaceProfile(workspace);
  const dailyLimit = profile.dailyLimit;

  const list = (
    <ContactList contacts={contacts.map(toChatRow)} counts={counts} selectedId={selected?.id ?? null} connectionUse={connectionUse} now={now} connection={connectionInfo} members={members} />
  );
  const shell = (children: React.ReactNode) => (
    <div className="flex h-[calc(100vh-1rem)] flex-col max-lg:h-screen">
      <Topbar crumbs={[{ label: 'Atendimento' }, { label: 'Conversas' }]} actions={<NewContactDialog />} />
      <CrmRealtime contactId={selected?.id ?? null} />
      <AvatarRefresher ids={(search ? contacts : contacts.filter((c) => c.chat_state === tab)).map((c) => c.id)} enabled={connection === 'conectado'} />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_320px]">{children}</div>
    </div>
  );
  const listCol = (hide: boolean) => <div key="lista" className={`flex min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1 ${hide ? 'max-lg:hidden' : ''}`}>{list}</div>;

  if (!selected) {
    return shell(
      <>
        {listCol(false)}
        <div key="vazio" className="col-span-full hidden animate-fade-in min-h-0 flex-col items-center justify-center gap-2 text-center lg:col-span-1 lg:flex xl:col-span-2">
          <span className="mb-1 rounded-full bg-secondary p-4"><MessageCircle className="size-7 text-muted-foreground" /></span>
          <p className="text-sm font-medium">{counts.pendente > 0 ? `${counts.pendente} atendimento${counts.pendente === 1 ? '' : 's'} pendente${counts.pendente === 1 ? '' : 's'}` : 'Escolha uma conversa'}</p>
          <p className="max-w-xs text-xs text-muted-foreground">Clicar num pendente só mostra a conversa; abra o atendimento para responder. Cada envio é um clique seu.</p>
        </div>
      </>,
    );
  }

  const closing = params.fechar === '1' && selected.status !== 'nao_contatar';
  const [lead, messages, logs, dnc, existingClient] = await Promise.all([
    selected.lead_id ? getLead(db, selected.lead_id) : null,
    listMessages(db, selected.id, MESSAGE_LIMIT),
    listChatLogs(db, selected.id),
    db.from('do_not_contact').select('phone_e164').in('phone_e164', phoneMatchCandidates(selected.phone_e164)).limit(1),
    closing ? clientByContact(db, selected.id) : null,
  ]);
  const [events, responsibleEvents, batch, urls, profiles] = await Promise.all([
    selected.lead_id ? listEvents(db, selected.lead_id) : [],
    listResponsibleEvents(db, selected.id),
    selected.batch_id ? getBatch(db, selected.batch_id) : null,
    mediaUrls(db, messages as ThreadMessage[]),
    profilesOrEmpty(db, [user.id, ...messages.flatMap((m) => (m.sent_by ? [m.sent_by] : []))]),
  ]);

  const gone = [selected.responsible_id, ...responsibleEvents.flatMap((e) => [e.to_id, e.by_id]), ...logs.flatMap((l) => [l.sent_by, ...(l.meta.log?.field === 'responsavel' ? [l.meta.log.from, l.meta.log.to] : [])])]
    .filter((id): id is string => !!id && !members.some((m) => m.id === id));
  const past = await profilesOrEmpty(db, gone);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? past.get(id)?.name ?? 'ex-membro';

  const link = lead?.page_url ?? null;

  const threadMessages: ThreadMessage[] = messages.map((m) => ({ ...m, mediaUrl: m.media_path ? (urls.get(m.media_path) ?? null) : null }));
  const firstAt = messages[0]?.at;
  // Com a lista cortada no limite, logs de antes da primeira mensagem ficariam soltos no topo.
  const timeline: ThreadMessage[] = [
    ...threadMessages,
    ...logs.filter((l) => l.meta.log && (messages.length < MESSAGE_LIMIT || l.at >= firstAt!)).map((l) => ({ ...l, logLabel: chatLogLabel(l.meta.log!, l.sent_by, nameOf) })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const legacy: LegacyLine[] = firstAt
    ? events.filter((e) => e.created_at < firstAt && e.type !== 'abertura').flatMap((e) => { const label = eventLabel(e); return label ? [{ at: e.created_at, label }] : []; }).reverse().slice(-12)
    : [];
  const history: HistoryItem[] = [
    ...events.flatMap((e) => { const label = eventLabel(e); return label ? [{ at: e.created_at, label }] : []; }),
    ...responsibleEvents.map((e) => ({ at: e.created_at, label: responsibleLabel(e, nameOf) })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);

  const templates: Template[] = [];
  if (lead && link) {
    try { templates.push({ label: 'Primeiro contato', text: firstContactText(lead, link, profile.signer) }); } catch { /* lead sem campo da mensagem */ }
    templates.push({ label: 'Follow-up', text: followUpText(link, profile.signer) });
  }

  const blockReason = sendBlockReason(selected as Contact, { doNotContact: !!dnc.data?.length, connected: connection !== 'desconectado', kind: 'normal' })
    ?? (outreachKind(selected.status, !!selected.responded_at, await outreachCount(db, selected as Contact)) === 'bloqueado' ? FOLLOW_UP_LIMIT_MESSAGE : null);
  const flow = lead ? flowLabel(lead).label : null;
  const origin = selected.origin === 'batch'
    ? { label: batch ? `Batch ${batchName(batch)}` : 'Batch', href: batch ? `/painel/batches/${batch.id}` : null }
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
  const me = { userId: user.id, email: user.email, name: profile.signer, avatar: (connectionRow.data?.profile_pic_url as string | null | undefined) ?? null, phone: phoneLabel, connectionName: (connectionRow.data?.profile_name as string | null | undefined) ?? null };
  const variables: Variable[] = [
    { key: 'nome', label: 'Nome do contato', value: selected.name },
    { key: 'primeiro_nome', label: 'Primeiro nome', value: selected.name.split(/\s+/)[0] ?? null },
    { key: 'telefone', label: 'Telefone', value: selected.phone_e164 },
    { key: 'link', label: 'Link da página', value: link },
    { key: 'cidade', label: 'Cidade', value: lead?.city ?? null },
    { key: 'empresa', label: 'Nome comercial', value: profile.company },
    { key: 'meu_nome', label: 'Seu nome', value: profile.signer },
  ];
  const quickReplies = (await listQuickReplies(db, { onlyActive: true })).map((r) => ({ shortcut: r.shortcut, title: r.title, text: r.body }));
  const mediaMessages = threadMessages.filter((m) => m.kind !== 'texto' && m.direction !== 'nota');
  const notes = threadMessages.filter((m) => m.direction === 'nota');

  return shell(
    <>
      {closeDefaults && <CloseDealDrawer key="fechar" contactName={selected.name} defaults={closeDefaults} existingClient={!!existingClient} closeHref={crmHref(tab, { q: search, filters, contato: selected.id })} catalog={await listCatalog(db, { onlyActive: true })} />}
      {listCol(true)}
      <div key="conversa" className="flex min-h-0 flex-col [&>*]:min-h-0 [&>*]:flex-1">
        <Conversation
          key={selected.id}
          contact={selected}
          messages={timeline}
          legacy={legacy}
          now={now}
          draft={composerDraft({ contact: selected, lead, link, texto: params.texto, now, signer: profile.signer })}
          templates={templates}
          blockReason={blockReason}
          stopRequest={stopRequestPending(messages)}
          dailyCount={firstToday}
          dailyLimit={dailyLimit}
          quickReplies={quickReplies}
          variables={variables}
          me={me}
          responsibleName={selected.responsible_id ? nameOf(selected.responsible_id) : null}
          isMember={members.some((m) => m.id === user.id)}
          profiles={Object.fromEntries(profiles)}
        />
      </div>
      <div key="painel" className="hidden min-h-0 animate-fade-in flex-col xl:flex [&>*]:min-h-0 [&>*]:flex-1">
        <ContactPanel
          contact={selected}
          lead={lead}
          origin={origin}
          flowLabel={flow}
          history={history}
          connectionName={me.connectionName}
          media={mediaMessages}
          notes={notes}
          now={now.toISOString()}
          members={members}
        />
      </div>
    </>,
  );
}
