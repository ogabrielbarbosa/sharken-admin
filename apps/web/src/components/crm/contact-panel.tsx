'use client';

import { canSetStatus, type ChatState, type Contact, type ContactStatus, type Lead } from '@lps/domain';
import {
  Ban, CalendarDays, Check, CircleDot, Clock3, Copy, Gauge, Handshake, History, Hourglass, Image as ImageIcon, Layers, MessageCircle, MessageSquareText,
  Phone, Radio, Route, StickyNote, Tag, ThumbsDown, Timer, User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { closeChatAction, reopenChatAction, saveLeadCommentAction, setStatusAction } from '@/app/painel/crm/actions';
import { ErrorNote } from '@/components/ui';
import { ago, crmHref, duration, STATUS_LABEL } from '@/lib/crm';
import { Avatar } from './avatar';
import { FollowUpBlock } from './follow-up-block';
import { LinksBlock } from './links-block';
import { InlineSelect, Row, Section } from './panel-parts';
import type { ThreadMessage } from './thread';

export type HistoryItem = { at: string; label: string };
export type PanelProps = {
  contact: Contact;
  lead: Lead | null;
  origin: { label: string; href: string | null };
  flowLabel: string | null;
  history: HistoryItem[];
  closeHref: string;
  firstResponse: string | null;
  media: ThreadMessage[];
  notes: ThreadMessage[];
  now: string;
};

type Tab = 'contato' | 'historico' | 'midia' | 'notas';
const TZ = 'America/Sao_Paulo';
const MANUAL_STATUSES: ContactStatus[] = ['novo', 'contatado', 'follow_up', 'em_conversa', 'perdido', 'nao_contatar'];
const CHAT_LABEL: Record<ChatState, string> = { aberto: 'Aberto', pendente: 'Pendente', fechado: 'Fechado' };
const CHAT_DOT: Record<ChatState, string> = { aberto: 'bg-success', pendente: 'bg-warning', fechado: 'bg-neutral-500' };

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).replace(/\./g, '');

function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}

function TabButton({ active, label, onClick, children, count }: { active: boolean; label: string; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} className={`relative inline-flex h-11 flex-1 cursor-pointer items-center justify-center border-b-2 transition-colors [&_svg]:size-[18px] ${active ? 'border-sky-400 text-sky-300' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
      {children}
      {!!count && <span className="absolute right-2 top-2 min-w-4 rounded-full bg-secondary px-1 text-[10px] leading-4 text-foreground">{count}</span>}
    </button>
  );
}

function LeadComment({ contactId, initial }: { contactId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1 pt-1">
      <textarea
        aria-label="Comentário interno"
        rows={2}
        value={value}
        placeholder="Adicionar comentário interno…"
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value.trim() !== initial.trim()) start(async () => { const out = await saveLeadCommentAction(contactId, value); setError(out.ok ? null : out.error); }); }}
        className="w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] outline-none placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-input-bg"
      />
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function ContactPanel({ contact, lead, origin, flowLabel, history, closeHref, firstResponse, media, notes, now: nowIso }: PanelProps) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [tab, setTab] = useState<Tab>('contato');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ended = contact.status === 'nao_contatar';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const out = await fn();
    setError(out.ok ? null : (out.error ?? 'Algo deu errado.'));
    if (out.ok) after?.();
  });
  const changeStatus = (to: ContactStatus) => {
    if (to === 'nao_contatar' && !window.confirm('Marcar como Não contatar? Isso é permanente e bloqueia o envio para este número.')) return;
    if (to === 'perdido' && !window.confirm('Marcar este contato como perdido?')) return;
    run(() => setStatusAction(contact.id, to));
  };
  const changeChat = (to: ChatState) => {
    if (to === 'fechado') run(() => closeChatAction(contact.id), () => router.push(crmHref('aberto')));
    else run(() => reopenChatAction(contact.id), () => router.replace(crmHref('aberto', { contato: contact.id }), { scroll: false }));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(formatPhone(contact.phone_e164)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem permissão */ }
  };

  const statusOptions = MANUAL_STATUSES.filter((s) => s === contact.status || canSetStatus(contact.status, s)).map((s) => ({ value: s, label: STATUS_LABEL[s].label }));
  if (contact.status === 'fechado') statusOptions.unshift({ value: 'fechado', label: STATUS_LABEL.fechado.label });
  const chatOptions = (contact.chat_state === 'pendente' ? (['pendente', 'aberto', 'fechado'] as ChatState[]) : (['aberto', 'fechado'] as ChatState[])).map((s) => ({ value: s, label: CHAT_LABEL[s] }));

  return (
    <aside aria-label="Contato" className="flex min-h-0 flex-col border-l border-border">
      <nav className="flex shrink-0 items-center border-b border-border px-2" aria-label="Painel do contato">
        <TabButton active={tab === 'contato'} label="Contato" onClick={() => setTab('contato')}><User /></TabButton>
        <TabButton active={tab === 'historico'} label="Histórico" onClick={() => setTab('historico')}><History /></TabButton>
        <TabButton active={tab === 'midia'} label="Mídia e arquivos" onClick={() => setTab('midia')} count={media.length}><ImageIcon /></TabButton>
        <TabButton active={tab === 'notas'} label="Notas internas" onClick={() => setTab('notas')} count={notes.length}><StickyNote /></TabButton>
      </nav>

      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <span className="relative">
          <Avatar name={contact.name} src={contact.avatar_url} seed={contact.id} size={36} />
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-success ring-2 ring-background"><MessageCircle className="size-2.5 text-background" /></span>
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{contact.name}</p>
        <button type="button" onClick={() => void copy()} title="Copiar telefone" aria-label="Copiar telefone" className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <div className="px-4 pt-3"><ErrorNote>{error}</ErrorNote></div>}

        {tab === 'contato' && (
          <>
            <Section title="Atendimento">
              <Row icon={<CircleDot />} label="Estado">
                <span className="flex items-center gap-1.5"><span className={`size-1.5 shrink-0 rounded-full ${CHAT_DOT[contact.chat_state]}`} /><InlineSelect label="Estado do atendimento" value={contact.chat_state} options={chatOptions} disabled={pending} onChange={(v) => v !== contact.chat_state && changeChat(v)} /></span>
              </Row>
              <Row icon={<Hourglass />} label={contact.chat_state === 'fechado' ? 'Fechado há' : contact.chat_state === 'pendente' ? 'Pendente há' : 'Em aberto'}>{duration(now.getTime() - new Date(contact.chat_state_at).getTime())}</Row>
              <Row icon={<Tag />} label="Status">
                <InlineSelect label="Status comercial" value={contact.status} options={statusOptions} disabled={pending || ended || contact.status === 'fechado'} onChange={(v) => v !== contact.status && changeStatus(v)} />
              </Row>
              <Row icon={<Radio />} label="Canal">WhatsApp · Evolution</Row>
              <Row icon={<Timer />} label="1ª resposta">{firstResponse ?? '—'}</Row>
            </Section>

            <Section title="Contato">
              <Row icon={<Phone />} label="Telefone"><span className="font-mono text-[12px]">{formatPhone(contact.phone_e164)}</span></Row>
              <Row icon={<Layers />} label="Origem">
                {origin.href ? <Link href={origin.href} className="flex items-center gap-1.5 hover:underline"><span className="size-1.5 shrink-0 rounded-full bg-sky-400" /><span className="truncate">{origin.label}</span></Link> : <span className="flex items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full bg-neutral-500" />{origin.label}</span>}
              </Row>
              <Row icon={<CalendarDays />} label="Contato desde">{day(contact.created_at)}</Row>
              <Row icon={<Clock3 />} label="Última interação">{ago(contact.last_message_at, now)}</Row>
            </Section>

            {lead && (
              <Section title="Lead">
                {flowLabel && <Row icon={<Route />} label="Fluxo">{flowLabel}</Row>}
                {lead.score !== null && <Row icon={<Gauge />} label="Pontuação">{lead.score} / 100</Row>}
                {lead.reason && <Row icon={<MessageSquareText />} label="Motivo"><span title={lead.reason}>{lead.reason}</span></Row>}
                <LeadComment contactId={contact.id} initial={lead.comment ?? ''} />
              </Section>
            )}

            {lead && <LinksBlock key={`${lead.page_url}|${lead.loom_url}`} contactId={contact.id} links={{ page: lead.page_url, loom: lead.loom_url }} />}

            <FollowUpBlock key={`${contact.follow_up_at}|${contact.follow_up_note}`} contactId={contact.id} at={contact.follow_up_at} note={contact.follow_up_note} disabled={ended} />
          </>
        )}

        {tab === 'historico' && (
          <div className="px-4 py-4">
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>}
            <ol className="relative space-y-4 border-l border-border pl-4">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-foreground ring-4 ring-background" />
                  <p className="text-[13px]">{h.label}</p>
                  <p className="text-xs text-muted-foreground">{when(h.at)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tab === 'midia' && (
          <div className="p-4">
            {media.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mídia nesta conversa.</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {media.filter((m) => m.kind === 'imagem' && m.mediaUrl).map((m) => (
                <a key={m.id} href={m.mediaUrl!} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-md bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.mediaUrl!} alt="" className="size-full object-cover" />
                </a>
              ))}
            </div>
            <ul className="mt-3 space-y-1">
              {media.filter((m) => m.kind !== 'imagem').map((m) => (
                <li key={m.id}>
                  <a href={m.mediaUrl ?? undefined} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-accent">
                    <span className="truncate">{{ audio: 'Áudio', video: 'Vídeo', documento: 'Documento', outro: 'Arquivo', texto: 'Arquivo', imagem: 'Imagem' }[m.kind]} · {m.direction === 'saida' ? 'enviado' : 'recebido'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{when(m.at)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'notas' && (
          <div className="space-y-2 p-4">
            {notes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota. Use a aba Nota no campo de mensagem.</p>}
            {[...notes].reverse().map((n) => (
              <div key={n.id} className="rounded-lg border border-amber-500/20 bg-amber-950/25 px-3 py-2">
                <p className="whitespace-pre-wrap text-[13px] text-amber-50/90">{n.body}</p>
                <p className="mt-1 text-[11px] text-amber-200/50">{when(n.at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-border p-3">
        {ended ? (
          <span className="flex h-9 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium opacity-60"><Handshake className="size-4" />Fechar negócio</span>
        ) : (
          <Link href={closeHref} scroll={false} className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-white"><Handshake className="size-4" />{contact.status === 'fechado' ? 'Novo negócio' : 'Fechar negócio'}</Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending || ended || contact.status === 'perdido'} onClick={() => changeStatus('perdido')} className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><ThumbsDown className="size-4" />Perdido</button>
          <button type="button" disabled={pending || ended} onClick={() => changeStatus('nao_contatar')} className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"><Ban className="size-4" />Não contatar</button>
        </div>
      </footer>
    </aside>
  );
}
