import { MESSAGES, getEnv } from '@lps/config';
import { listLeads, listSites } from '@lps/db';
import { buildFollowUpMessage, FOLLOW_UP_DAYS, isFollowUpDue, type Lead } from '@lps/domain';
import { MessageSquareReply } from 'lucide-react';
import Link from 'next/link';
import { ContactComposer } from '@/components/leads/contact-composer';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { Button, Card, SectionTitle, Status, Table } from '@/components/ui';
import { loadBatchContext } from '@/lib/batch-context';
import { daysBetween } from '@/lib/dates';
import { formatDate, leadMeta } from '@/lib/lead-labels';
import { respondedAction } from '../contact-actions';

function RespondedButton({ leadId }: { leadId: string }) {
  return (
    <form action={respondedAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <Button type="submit" variant="outline"><MessageSquareReply />Respondeu</Button>
    </form>
  );
}

function situation(lead: Lead, now: Date) {
  if (lead.stage === 'follow_up_feito') return { tone: 'neutral' as const, label: 'Follow-up enviado', detail: 'Sem novo follow-up' };
  const left = Math.max(FOLLOW_UP_DAYS - daysBetween(lead.contacted_at ?? now, now), 1);
  return { tone: 'warning' as const, label: 'Aguardando', detail: `Follow-up em ${left} ${left === 1 ? 'dia' : 'dias'}` };
}

export default async function AguardarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['aguardando', 'follow_up_feito']);
  const sites = await listSites(db, leads.map((l) => l.id));
  const now = new Date();
  const due = leads.filter((l) => isFollowUpDue(l, now));
  const others = leads.filter((l) => !isFollowUpDue(l, now));
  const appUrl = due.length ? getEnv().APP_URL : '';

  return (
    <>
      {due.length > 0 && (
        <>
          <SectionTitle count={due.length} tone="warning">Follow-up vencido</SectionTitle>
          <div className="stagger mb-8 grid gap-4 xl:grid-cols-2">
            {due.map((lead) => {
              const slug = sites.get(lead.id)?.slug;
              return (
                <Card key={lead.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                      <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Enviado em {formatDate(lead.contacted_at)} · há {daysBetween(lead.contacted_at!, now)} dias</p>
                    </div>
                    <Status tone="danger" live>Follow-up vencido</Status>
                  </div>
                  <ContactComposer
                    key={lead.id}
                    leadId={lead.id}
                    phone={lead.phone_e164 ?? ''}
                    initial={buildFollowUpMessage(lead, MESSAGES, { link: slug ? new URL(`/p/${slug}`, appUrl).toString() : appUrl })}
                    kind="follow_up"
                    label="Mensagem de follow-up"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <RespondedButton leadId={lead.id} />
                    <ExitButtons leadId={lead.id} />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
      <SectionTitle count={others.length}>Contatados</SectionTitle>
      <Card>
        {others.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum lead aguardando.</p> : (
          <Table head={['Lead', 'Data do envio', 'Situação', '']}>
            {others.map((lead) => {
              const s = situation(lead, now);
              return (
                <tr key={lead.id}>
                  <td className="px-4 py-3">
                    <Link href={`/painel/leads/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                    <p className="text-xs text-muted-foreground">{leadMeta(lead)}</p>
                  </td>
                  <td className="px-4 py-3">{formatDate(lead.contacted_at)}</td>
                  <td className="px-4 py-3"><Status tone={s.tone}>{s.label}</Status><p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap items-center justify-end gap-1"><RespondedButton leadId={lead.id} /><ExitButtons leadId={lead.id} /></div></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
