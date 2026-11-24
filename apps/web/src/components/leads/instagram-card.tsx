'use client';

import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { Button, Card, ErrorNote } from '@/components/ui';
import { analyzeInstagramAction } from '@/lib/common-lead-actions';

type Photo = { url: string; href: string; caption: string | null };
const FIRST = 12;

function Grid({ title, photos }: { title: string; photos: Photo[] }) {
  const [all, setAll] = useState(false);
  if (!photos.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{title} · {photos.length}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-6">
        {(all ? photos : photos.slice(0, FIRST)).map((p) => (
          <a key={p.url} href={p.href} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption?.slice(0, 120) || ''} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </a>
        ))}
      </div>
      {!all && photos.length > FIRST && <Button variant="ghost" onClick={() => setAll(true)}>Ver todas as {photos.length}</Button>}
    </div>
  );
}

/** Imagens do lead (Instagram e Google Maps) e o botão que lê o perfil do Instagram pelo Apify. */
export function InstagramCard({ leadId, handle, detail, apify, job, instagram, maps }: {
  leadId: string;
  handle: string | null;
  detail: string;
  apify: boolean;
  job: { status: string; error: string | null } | null;
  instagram: Photo[];
  maps: Photo[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === 'pendente' || job?.status === 'executando';
  const reason = !handle ? 'O lead não tem Instagram' : !apify ? 'Conecte o Apify em Configurações' : undefined;

  function analyze() {
    setError(null);
    start(async () => {
      const r = await analyzeInstagramAction(leadId);
      if (r.error) setError(r.error);
    });
  }

  return (
    <Card className="space-y-4 p-5">
      {running && <AutoRefresh ms={4000} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">Instagram e fotos</h2>
          <p className="truncate text-xs text-muted-foreground">{handle ? `@${handle} · ${detail}` : 'Sem Instagram no cadastro'}</p>
        </div>
        <span data-tip={reason ?? (running ? undefined : 'Lê o perfil pelo Apify (gasta crédito)')}>
          <Button variant="outline" disabled={pending || running || !!reason} onClick={analyze}>
            {pending || running ? <Loader2 className="animate-spin" /> : instagram.length ? <RefreshCw /> : <Sparkles />}
            {running ? 'Analisando…' : instagram.length ? 'Atualizar do Instagram' : 'Analisar Instagram'}
          </Button>
        </span>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!error && job?.status === 'erro' && <ErrorNote>A última leitura falhou: {job.error ?? 'erro desconhecido'}</ErrorNote>}
      <Grid title="Instagram" photos={instagram} />
      <Grid title="Google Maps" photos={maps} />
      {!instagram.length && !maps.length && !running && <p className="text-sm text-muted-foreground">Nenhuma imagem ainda.{handle ? ' Analise o Instagram para puxar a foto de perfil e os últimos posts.' : ''}</p>}
    </Card>
  );
}
