import { lastEventOf, listLeads } from '@lps/db';
import { Check, MessageCircle, MessagesSquare, X } from 'lucide-react';
import Link from 'next/link';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { ReplyAssistant } from '@/components/leads/reply-assistant';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, Status } from '@/components/ui';
import { loadBatchContext } from '@/lib/batch-context';
import { flowLabel, formatDate, leadMeta } from '@/lib/lead-labels';
import { markNoInterestAction, markSoldAction } from './actions';

export default async function ConversaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lead?: string }> }) {
  const { id } = await params;
  const { lead: selectedId } = await searchParams;
  const { db } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['conversa']);
  const description = 'Leads que responderam. Cole a mensagem recebida e use a sugestão como ponto de partida.';
  if (!leads.length) {
    return (
      <>
        <PageHeader title="Conversa" description={description} />
        <EmptyState icon={<MessagesSquare />} title="Nenhuma resposta ainda" description="Quando um lead responder, marque em Aguardar e ele aparece aqui." />
      </>
    );
  }
  const incoming = await lastEventOf(db, leads.map((l) => l.id), 'mensagem_recebida');
  const lead = leads.find((l) => l.id === selectedId) ?? leads[0];
  const flow = flowLabel(lead);
  const lastText = (leadId: string) => (incoming.get(leadId)?.data.text as string | undefined) ?? '';

  return (
    <>
      <PageHeader title="Conversa" description={description} />
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <Card className="h-fit p-2">
          <h2 className="flex items-center gap-2 px-2 py-2 text-sm font-medium">Responderam <Badge>{leads.length}</Badge></h2>
          <ul className="space-y-1">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`?lead=${l.id}`} className={`block rounded-md px-2 py-2 text-sm ${l.id === lead.id ? 'bg-accent' : 'hover:bg-accent/50'}`}>
                  <span className="flex justify-between gap-2"><span className="truncate font-medium">{l.name}</span><span className="shrink-0 text-xs text-muted-foreground">{formatDate(l.responded_at)}</span></span>
                  {lastText(l.id) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">“{lastText(l.id)}”</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/painel/leads/${lead.id}`} className="text-lg font-semibold hover:underline">{lead.name}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{lead.phone_raw} · {leadMeta(lead)}</p>
              <div className="mt-1"><Status tone={flow.tone}>{flow.label}</Status></div>
            </div>
            {lead.phone_e164 && <LinkButton href={`https://wa.me/${lead.phone_e164}`} variant="outline" external><MessageCircle />Abrir no WhatsApp</LinkButton>}
          </div>
          <ReplyAssistant key={lead.id} leadId={lead.id} initialIncoming={lastText(lead.id)} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Resultado da conversa</span>
              <form action={markSoldAction}><input type="hidden" name="leadId" value={lead.id} /><Button type="submit"><Check />Vendido</Button></form>
              <form action={markNoInterestAction}><input type="hidden" name="leadId" value={lead.id} /><Button type="submit" variant="outline"><X />Sem interesse</Button></form>
            </div>
            <ExitButtons leadId={lead.id} />
          </div>
        </Card>
      </div>
    </>
  );
}
