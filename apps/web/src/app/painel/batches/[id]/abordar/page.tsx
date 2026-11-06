import { MESSAGES, getEnv } from '@lps/config';
import { countEventsSince, getSite, listLeads, SEND_EVENTS, listVideos } from '@lps/db';
import { DAILY_SEND_WARNING, selectFirstMessage } from '@lps/domain';
import { ArrowRight, Ban, CheckCircle2, ExternalLink, PhoneOff, Play } from 'lucide-react';
import Link from 'next/link';
import { ContactComposer } from '@/components/leads/contact-composer';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { Badge, Button, Card, EmptyState, ErrorNote, LinkButton, PageHeader, Status } from '@/components/ui';
import { loadBatchContext } from '@/lib/batch-context';
import { startOfTodayBrazil } from '@/lib/dates';
import { flowLabel, leadMeta } from '@/lib/lead-labels';
import { askedToStopAction, invalidNumberAction } from '../contact-actions';

const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-semibold">{value}</p>
  </div>
);

export default async function AbordarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await loadBatchContext(id);
  const today = startOfTodayBrazil();
  const [queue, sentAll, sentBatch] = await Promise.all([
    listLeads(db, id, ['abordar']),
    countEventsSince(db, SEND_EVENTS, today),
    countEventsSince(db, ['contato_enviado'], today, id),
  ]);
  const header = (description: string, position: string) => (
    <PageHeader title="Abordar" description={description} actions={<><Metric label="Posição na fila" value={position} /><Metric label="Envios hoje" value={sentAll} /></>} />
  );

  if (!queue.length) {
    const [invalid, stopped] = await Promise.all([
      countEventsSince(db, ['numero_invalido'], today, id),
      countEventsSince(db, ['pediu_para_parar'], today, id),
    ]);
    return (
      <>
        {header('Fila de hoje concluída.', '—')}
        <EmptyState
          icon={<CheckCircle2 />}
          title="Fila concluída"
          description={`Você enviou ${sentBatch} ${sentBatch === 1 ? 'mensagem' : 'mensagens'} hoje neste batch. Os leads contatados estão em Aguardar, onde aparecem os follow-ups quando vencerem.`}
          actions={<><LinkButton href={`/painel/batches/${id}/material`} variant="outline">Ver Material</LinkButton><LinkButton href={`/painel/batches/${id}/aguardar`}>Ir para Aguardar<ArrowRight /></LinkButton></>}
        />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Metric label="Enviadas" value={sentBatch} />
          <Metric label="Número inválido" value={invalid} />
          <Metric label="Pediu para parar" value={stopped} />
        </div>
      </>
    );
  }

  const [lead, ...next] = queue;
  const [site, videos] = await Promise.all([getSite(db, lead.id), listVideos(db, [lead.id])]);
  const video = videos.get(lead.id);
  const pageUrl = site ? new URL(`/p/${site.slug}`, getEnv().APP_URL).toString() : '';
  const flow = flowLabel(lead);
  let message = '';
  let messageError: string | null = null;
  try {
    message = selectFirstMessage(lead, MESSAGES, { link: pageUrl });
  } catch (err) {
    messageError = (err as Error).message;
  }
  const phone = lead.phone_e164 ?? '';

  return (
    <>
      {header('Um lead por vez. Abra no WhatsApp, envie você mesmo e confirme aqui.', `${sentBatch + 1} de ${sentBatch + queue.length}`)}
      {sentAll >= DAILY_SEND_WARNING && (
        <div className="mb-4"><ErrorNote>Você já enviou {sentAll} mensagens hoje. O volume recomendado para o início é de {DAILY_SEND_WARNING} por dia.</ErrorNote></div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/painel/leads/${lead.id}`} className="text-lg font-semibold hover:underline">{lead.name}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{lead.phone_raw} · {leadMeta(lead)}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Tipo de fluxo</p>
              <Status tone={flow.tone}>{flow.label}</Status>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {site && <LinkButton href={`/p/${site.slug}`} variant="outline" external><ExternalLink />Página de exemplo</LinkButton>}
            {site?.content.videoUrl && <LinkButton href={site.content.videoUrl} variant="outline" external><Play />Vídeo{video?.duration_seconds ? ` (${Math.round(Number(video.duration_seconds))} s)` : ''}</LinkButton>}
          </div>
          {messageError
            ? <ErrorNote>Não foi possível montar a mensagem: {messageError}</ErrorNote>
            : <ContactComposer key={lead.id} leadId={lead.id} phone={phone} initial={message} kind="first" label="Mensagem de primeiro contato" />}
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-1">
              <form action={invalidNumberAction}><input type="hidden" name="leadId" value={lead.id} /><Button type="submit" variant="ghost"><PhoneOff />Número inválido</Button></form>
              <form action={askedToStopAction}><input type="hidden" name="leadId" value={lead.id} /><Button type="submit" variant="ghost"><Ban />Pediu para parar</Button></form>
            </div>
            <ExitButtons leadId={lead.id} />
          </div>
        </Card>
        <Card className="h-fit p-4">
          <h2 className="mb-3 flex items-center justify-between text-sm font-medium">Próximos na fila <Badge>{next.length}</Badge></h2>
          {next.length === 0 && <p className="text-sm text-muted-foreground">Este é o último da fila.</p>}
          <ol className="space-y-2">
            {next.slice(0, 8).map((n, i) => {
              const f = flowLabel(n);
              return (
                <li key={n.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-xs text-muted-foreground">{sentBatch + i + 2}</span>
                  <Link href={`/painel/leads/${n.id}`} className="min-w-0 flex-1 truncate hover:underline">{n.name}</Link>
                  <Status tone={f.tone}>{f.label}</Status>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}
