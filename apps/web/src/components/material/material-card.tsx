'use client';

import { Check, ExternalLink, RotateCcw, Timer, Video, VideoOff } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Badge, Button, Card, LinkButton, Status, type Tone } from '@/components/ui';
import { approveMaterialAction, retryVideoAction, useTemplateAction as switchToTemplate } from '@/app/painel/batches/[id]/material/actions';
import { ExitButtons } from '@/components/leads/exit-buttons';
import { RedoDialog } from './redo-dialog';
import { VideoUploadButton } from './video-upload-button';

export type MaterialCardData = {
  leadId: string;
  name: string;
  meta: string;
  flow: { label: string; tone: Tone };
  slug: string | null;
  screenshots: { mobile: string; desktop: string } | null;
  video: { state: 'nenhum' | 'convertendo' | 'pronto' | 'erro'; duration: string | null; url: string | null; error: string | null };
  deadline: string;
  generator: 'template' | 'agente' | null;
};

function VideoBadge({ video }: { video: MaterialCardData['video'] }) {
  if (video.state === 'pronto')
    return (
      <a href={video.url ?? undefined} target="_blank" rel="noreferrer" title="Abrir o vídeo">
        <Badge tone="success"><Video className="mr-1 inline size-3.5" />Vídeo gravado{video.duration ? ` · ${video.duration}` : ''}</Badge>
      </a>
    );
  if (video.state === 'convertendo') return <Badge tone="warning">Convertendo vídeo…</Badge>;
  if (video.state === 'erro') return <Badge tone="danger">Erro no vídeo</Badge>;
  return <Badge><VideoOff className="mr-1 inline size-3.5" />Sem vídeo</Badge>;
}

export function MaterialCard({ data }: { data: MaterialCardData }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex h-56 items-end justify-center gap-3 bg-secondary px-4 pt-4">
        {data.screenshots ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.screenshots.mobile} alt={`Página de ${data.name} no celular`} className="h-full w-auto rounded-t-lg object-cover object-top" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.screenshots.desktop} alt={`Página de ${data.name} no computador`} className="mb-auto h-4/5 min-w-0 flex-1 rounded-lg object-cover object-top" />
          </>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">Sem prévia da página</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="font-medium">{data.name}</p>
          <p className="text-xs text-muted-foreground">{data.meta}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VideoBadge video={data.video} />
          <Badge><Timer className="mr-1 inline size-3.5" />{data.deadline}</Badge>
          <Status tone={data.flow.tone}>{data.flow.label}</Status>
          {data.generator === 'template' && <Badge>Template simples</Badge>}
        </div>
        {data.video.state === 'erro' && (
          <p className="text-xs text-destructive">{data.video.error ?? 'A conversão falhou.'}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {data.slug ? <LinkButton href={`/p/${data.slug}`} variant="outline" external><ExternalLink />Abrir página</LinkButton> : <span />}
          <VideoUploadButton leadId={data.leadId} replace={data.video.state !== 'nenhum'} onError={setError} />
          <RedoDialog leadId={data.leadId} name={data.name} />
          <Button disabled={pending} onClick={() => run(() => approveMaterialAction(data.leadId))}><Check />Aprovar e ir ao CRM</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-1">
          <ExitButtons leadId={data.leadId} />
          <div className="flex gap-1">
            {data.video.state === 'erro' && <Button variant="ghost" className="px-2" disabled={pending} onClick={() => run(() => retryVideoAction(data.leadId))}><RotateCcw />Converter de novo</Button>}
            {data.generator === 'agente' && <Button variant="ghost" className="px-2" disabled={pending} onClick={() => run(() => switchToTemplate(data.leadId))}>Usar template</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TemplateButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => start(async () => void (await switchToTemplate(leadId)))}>Usar template simples</Button>;
}
