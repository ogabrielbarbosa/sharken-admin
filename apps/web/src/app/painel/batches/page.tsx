import { listBatches, listBatchStages, listNoBatchStages, NO_BATCH } from '@lps/db';
import { PIPELINE_COLUMNS, summarizeBatch, type Batch, type LeadStage, type PipelineColumn } from '@lps/domain';
import { ChevronRight, Copy, Layers, Map as MapIcon, Plus, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { NewBatchDrawer } from '@/components/batches/new-batch-drawer';
import { Topbar } from '@/components/layout/topbar';
import { LeadsHeader } from '@/components/leads/leads-header';
import { Button, Card, EmptyState, LinkButton, Status, Table, type Tone, Select } from '@/components/ui';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { NO_BATCH_LABEL } from '@/lib/batch-context';
import { workspaceHasApify } from '@lps/integrations';
import { authedDb, getSession } from '@/lib/auth';
import { prospectedRows } from '@/lib/prospected';
import { retryBatchAction } from './actions';

const STATUS: Record<Batch['status'], { label: string; tone: Tone; detail: string }> = {
  buscando: { label: 'Buscando', tone: 'warning', detail: 'Buscando os negócios' },
  analisando: { label: 'Analisando', tone: 'warning', detail: 'Analisando os negócios' },
  concluido: { label: 'Concluído', tone: 'success', detail: '' },
  erro: { label: 'Erro', tone: 'danger', detail: '' },
};

const NO_BATCH_HREF = `/painel/batches/${NO_BATCH}`;
const ABBR: Record<PipelineColumn, string> = { novo: 'NOV', qualificado: 'QUA', pagina: 'PÁG', video: 'VÍD', pronto: 'PRO', descartados: 'DES' };

/** Quantos leads há em cada coluna do quadro. */
function StageCounts({ counts }: { counts: Record<PipelineColumn, number> }) {
  return (
    <div className="flex gap-3">
      {PIPELINE_COLUMNS.map((c) => (
        <span key={c.key} data-tip={c.label} className="text-center">
          <span className={`block text-sm tabular-nums ${counts[c.key] > 0 ? 'font-medium text-brand-light' : 'text-subtle-foreground'}`}>{counts[c.key]}</span>
          <span className="block font-mono text-[10px] text-muted-foreground">{ABBR[c.key]}</span>
        </span>
      ))}
    </div>
  );
}

/** `etapa` aceita a coluna (`qualificado`) ou um estágio (`revisar`, dos links da visão geral). */
const columnFor = (etapa: string) => PIPELINE_COLUMNS.find((c) => c.key === etapa || c.stages.includes(etapa as LeadStage));

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ novo?: string; local?: string; etapa?: string }> }) {
  const { novo, local, etapa } = await searchParams;
  const db = await authedDb();
  const { workspace } = await getSession();
  const [batches, stages, looseLeads, apifyConnected] = await Promise.all([listBatches(db), listBatchStages(db), listNoBatchStages(db), novo ? workspaceHasApify(workspace.id) : true]);
  const locations = [...new Map(batches.map((b) => [b.location_key, b.location])).entries()];

  const column = etapa ? columnFor(etapa) : undefined;
  const rows = batches
    .filter((b) => !local || b.location_key === local)
    .filter((b) => {
      if (!column) return true;
      return stages.some((s) => s.batch_id === b.id && column.stages.includes(s.stage));
    })
    .map((batch) => ({ batch, summary: summarizeBatch(stages.filter((s) => s.batch_id === batch.id)) }));

  const loose = { total: looseLeads.length, summary: summarizeBatch(looseLeads) };
  // Fixo no topo; os filtros de local e etapa só o escondem quando não há lead dele.
  const showLoose = !local && (!column || loose.summary.counts[column.key] > 0);

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Leads' }]}
        actions={
          <>
            <form>
              {etapa && <input type="hidden" name="etapa" value={etapa} />}
              <Select autoSubmit name="local" defaultValue={local ?? ''} aria-label="Localização" className="w-36 sm:w-52" options={[{ value: '', label: 'Todas as localizações' }, ...locations.map(([value, label]) => ({ value, label }))]} />
            </form>
            <LinkButton href="/painel/batches/mapa" variant="outline"><MapIcon /><span className="max-sm:sr-only">Mapa</span></LinkButton>
            <LinkButton href="/painel/batches/duplicados" variant="outline"><Copy /><span className="max-sm:sr-only">Possíveis duplicados</span></LinkButton>
            <LinkButton href="/painel/batches?novo=1"><Plus /><span className="max-sm:sr-only">Novo batch</span></LinkButton>
          </>
        }
      />
      {!novo && batches.some((b) => b.status === 'buscando' || b.status === 'analisando') && <AutoRefresh />}
      <LeadsHeader current="batches" />
      <main className="p-4 lg:p-6">
        {column && (
          <p className="mb-4 text-sm text-muted-foreground">
            Mostrando batches com leads em {column.label}.{' '}
            <Link href="/painel/batches" className="text-brand-soft hover:underline">Ver todos</Link>
          </p>
        )}
        {column && !rows.length && !loose.total ? (
          <EmptyState icon={<Layers />} title="Nenhum batch por aqui" description="Crie um batch para buscar negócios de uma região." actions={<LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton>} />
        ) : (
          <Card>
            <Table head={['Localização', 'Tipo de negócio', 'Quantidade', 'Status', 'Leads por etapa', 'Próxima ação', '']}>
              {showLoose && (
                <tr className="group/row">
                  <td className="px-4 py-3 font-medium"><Link href={NO_BATCH_HREF}>{NO_BATCH_LABEL}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3">{loose.total}</td>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3"><StageCounts counts={loose.summary.counts} /></td>
                  <td className="px-4 py-3 text-muted-foreground">Manual</td>
                  <td className="px-4 py-3 text-right"><Link href={NO_BATCH_HREF} aria-label={`Abrir ${NO_BATCH_LABEL}`}><ChevronRight className="ml-auto size-4 text-muted-foreground transition-[translate,color] duration-200 group-hover/row:translate-x-0.5 group-hover/row:text-brand-soft" /></Link></td>
                </tr>
              )}
              {rows.map(({ batch, summary }) => {
                const status = STATUS[batch.status];
                const href = `/painel/batches/${batch.id}`;
                const started = PIPELINE_COLUMNS.some((c) => summary.counts[c.key] > 0);
                return (
                  <tr key={batch.id} className="group/row">
                    <td className="px-4 py-3 font-medium"><Link href={href}>{batch.location}</Link></td>
                    <td className="px-4 py-3 text-muted-foreground">{batch.business_type}<span className="block text-xs text-subtle-foreground">{{ instagram: 'Instagram', maps: 'Google Maps', manual: 'Manual' }[batch.source]}</span></td>
                    <td className="px-4 py-3">{batch.source === 'manual' ? stages.filter((s) => s.batch_id === batch.id).length : batch.quantity}</td>
                    <td className="px-4 py-3"><Status tone={status.tone} live={batch.status === 'buscando' || batch.status === 'analisando'}>{status.label}</Status></td>
                    <td className="px-4 py-3">
                      {started ? (
                        <StageCounts counts={summary.counts} />
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
      {novo && <NewBatchDrawer apifyConnected={apifyConnected} prospected={prospectedRows(batches, stages)} />}
    </>
  );
}
