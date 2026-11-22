import { listBatches, listBatchStages } from '@lps/db';
import { PIPELINE_COLUMNS, summarizeBatch, type Batch, type LeadStage, type PipelineColumn } from '@lps/domain';
import { ChevronRight, Copy, Layers, Map as MapIcon, Plus, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { NewBatchDrawer } from '@/components/batches/new-batch-drawer';
import { Topbar } from '@/components/layout/topbar';
import { Button, Card, EmptyState, LinkButton, Status, Table, type Tone } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select';
import { workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from '@/lib/auth';
import { retryBatchAction } from './actions';

const STATUS: Record<Batch['status'], { label: string; tone: Tone; detail: string }> = {
  buscando: { label: 'Buscando', tone: 'warning', detail: 'Buscando os negócios' },
  analisando: { label: 'Analisando', tone: 'warning', detail: 'Analisando os negócios' },
  concluido: { label: 'Concluído', tone: 'success', detail: '' },
  erro: { label: 'Erro', tone: 'danger', detail: '' },
};

const ABBR: Record<PipelineColumn, string> = { novo: 'NOV', qualificado: 'QUA', pagina: 'PÁG', video: 'VÍD', pronto: 'PRO', descartados: 'DES' };

/** `etapa` aceita a coluna (`qualificado`) ou um estágio (`revisar`, dos links da visão geral). */
const columnFor = (etapa: string) => PIPELINE_COLUMNS.find((c) => c.key === etapa || c.stages.includes(etapa as LeadStage));

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ novo?: string; local?: string; etapa?: string }> }) {
  const { novo, local, etapa } = await searchParams;
  const db = await authedDb();
  const { workspace } = await getSession();
  const [batches, stages, apifyConnected] = await Promise.all([listBatches(db), listBatchStages(db), novo ? workspaceHasApify(workspace.id) : true]);
  const locations = [...new Map(batches.map((b) => [b.location_key, b.location])).entries()];

  const column = etapa ? columnFor(etapa) : undefined;
  const rows = batches
    .filter((b) => !local || b.location_key === local)
    .filter((b) => {
      if (!column) return true;
      return stages.some((s) => s.batch_id === b.id && column.stages.includes(s.stage));
    })
    .map((batch) => ({ batch, summary: summarizeBatch(stages.filter((s) => s.batch_id === batch.id)) }));

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Batches' }]}
        actions={
          <>
            <form>
              {etapa && <input type="hidden" name="etapa" value={etapa} />}
              <AutoSubmitSelect name="local" defaultValue={local ?? ''} aria-label="Localização" className="w-36 sm:w-52">
                <option value="">Localização: Todas</option>
                {locations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </AutoSubmitSelect>
            </form>
            <LinkButton href="/painel/batches/mapa" variant="outline"><MapIcon /><span className="max-sm:sr-only">Mapa</span></LinkButton>
            <LinkButton href="/painel/batches/duplicados" variant="outline"><Copy /><span className="max-sm:sr-only">Possíveis duplicados</span></LinkButton>
            <LinkButton href="/painel/batches?novo=1"><Plus /><span className="max-sm:sr-only">Novo batch</span></LinkButton>
          </>
        }
      />
      {!novo && batches.some((b) => b.status === 'buscando' || b.status === 'analisando') && <AutoRefresh />}
      <main className="p-4 lg:p-6">
        {column && (
          <p className="mb-4 text-sm text-muted-foreground">
            Mostrando batches com leads em {column.label}.{' '}
            <Link href="/painel/batches" className="text-brand-soft hover:underline">Ver todos</Link>
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState icon={<Layers />} title="Nenhum batch por aqui" description="Crie um batch para buscar negócios de uma região." actions={<LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton>} />
        ) : (
          <Card>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <h2 className="font-medium">Todos os batches</h2>
              <span className="text-muted-foreground">{rows.length} {rows.length === 1 ? 'batch' : 'batches'}</span>
            </div>
            <Table head={['Localização', 'Tipo de negócio', 'Quantidade', 'Status', 'Leads por etapa', 'Próxima ação', '']}>
              {rows.map(({ batch, summary }) => {
                const status = STATUS[batch.status];
                const href = `/painel/batches/${batch.id}`;
                const started = PIPELINE_COLUMNS.some((c) => summary.counts[c.key] > 0);
                return (
                  <tr key={batch.id} className="group/row">
                    <td className="px-4 py-3 font-medium"><Link href={href}>{batch.location}</Link></td>
                    <td className="px-4 py-3 text-muted-foreground">{batch.business_type}<span className="block text-xs text-subtle-foreground">{batch.source === 'instagram' ? 'Instagram' : 'Google Maps'}</span></td>
                    <td className="px-4 py-3">{batch.quantity}</td>
                    <td className="px-4 py-3"><Status tone={status.tone} live={batch.status === 'buscando' || batch.status === 'analisando'}>{status.label}</Status></td>
                    <td className="px-4 py-3">
                      {started ? (
                        <div className="flex gap-3">
                          {PIPELINE_COLUMNS.map((c) => (
                            <span key={c.key} title={c.label} className="text-center">
                              <span className={`block text-sm tabular-nums ${summary.counts[c.key] > 0 ? 'font-medium text-brand-light' : 'text-subtle-foreground'}`}>{summary.counts[c.key]}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground">{ABBR[c.key]}</span>
                            </span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {batch.status === 'erro'
                        ? <span className="text-destructive">{batch.error}</span>
                        : <span className="text-muted-foreground">{summary.nextAction ?? status.detail}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {batch.status === 'erro' ? (
                        <form action={retryBatchAction}>
                          <input type="hidden" name="id" value={batch.id} />
                          <Button type="submit" variant="outline"><RotateCcw />Repetir</Button>
                        </form>
                      ) : <Link href={href} aria-label="Abrir batch"><ChevronRight className="ml-auto size-4 text-muted-foreground transition-[translate,color] duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-brand-soft" /></Link>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}
      </main>
      {novo && <NewBatchDrawer apifyConnected={apifyConnected} prospected={batches.map((b) => ({ id: b.id, location: b.location, locations: b.locations, business_type: b.business_type, created_at: b.created_at, leads: stages.filter((s) => s.batch_id === b.id).length }))} />}
    </>
  );
}
