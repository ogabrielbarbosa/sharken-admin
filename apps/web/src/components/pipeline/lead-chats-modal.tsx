'use client';

import type { ChatState, Contact, Lead } from '@lps/domain';
import { ChevronRight, FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addLeadContactAction } from '@/app/painel/batches/[id]/actions';
import { Avatar } from '@/components/crm/avatar';
import { Button, ErrorNote, Input, LinkButton, Status } from '@/components/ui';
import { crmHref, formatPhone, listTime, STATUS_LABEL } from '@/lib/crm';
import { leadMeta } from '@/lib/lead-labels';
import { Modal } from './modal';

const CHAT_LABEL: Record<ChatState, string> = { aberto: 'Aberto', pendente: 'Pendente', fechado: 'Fechado' };
const CHAT_DOT: Record<ChatState, string> = { aberto: 'bg-success', pendente: 'bg-warning', fechado: 'bg-neutral-500' };

/** Mais um número do mesmo negócio. Abre com o nome do lead já preenchido. */
function AddNumber({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}><Plus />Adicionar número</Button>;
  const save = () => start(async () => {
    const out = await addLeadContactAction(lead.id, name, phone);
    if (!out.ok) { setError(out.error); return; }
    setError(null); setPhone(''); setOpen(false);
    router.refresh();
  });
  return (
    <form className="w-full space-y-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <Input aria-label="Nome do contato" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Recepção)" className="h-9" />
        <Input aria-label="Celular" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" className="h-9" />
        <div className="flex gap-1">
          <Button type="submit" disabled={pending || !name.trim() || !phone.trim()}>Adicionar</Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setOpen(false); setError(null); }}>Cancelar</Button>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
  );
}

/** Lead em Pronto para abordar: todas as conversas (números) ligadas a ele, com o estado de cada uma. */
export function LeadChatsModal({ lead, contacts, closeHref, now }: { lead: Lead; contacts: Contact[]; closeHref: string; now: string }) {
  const at = new Date(now);
  return (
    <Modal
      title={lead.name}
      subtitle={leadMeta(lead)}
      closeHref={closeHref}
      footer={
        <>
          <AddNumber lead={lead} />
          <LinkButton href={`/painel/leads/${lead.id}`} variant="outline"><FileText />Ficha do lead</LinkButton>
        </>
      }
    >
      <div className="p-2">
        <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {contacts.length === 0 ? 'Nenhuma conversa' : contacts.length === 1 ? '1 conversa' : `${contacts.length} conversas`}
        </p>
        {contacts.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Este lead ainda não tem contato no CRM. Adicione um número abaixo ou ligue uma conversa a ele pelo CRM.</p>}
        <ul>
          {contacts.map((c) => {
            const status = STATUS_LABEL[c.status];
            return (
              <li key={c.id}>
                <Link href={crmHref(c.chat_state, { contato: c.id })} className="flex items-center gap-3 rounded-md px-4 py-3 hover:bg-accent/50">
                  <Avatar name={c.name} src={c.avatar_url} seed={c.id} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      {c.unread_count > 0 && <span className="rounded-full bg-success px-1.5 text-[11px] font-medium leading-4 text-background">{c.unread_count}</span>}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{formatPhone(c.phone_e164)}</span>
                    {c.last_message_preview && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.last_message_preview}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <Status tone={status.tone}>{status.label}</Status>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className={`size-1.5 rounded-full ${CHAT_DOT[c.chat_state]}`} />{CHAT_LABEL[c.chat_state]}
                      {c.last_message_at && <> · {listTime(c.last_message_at, at)}</>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
