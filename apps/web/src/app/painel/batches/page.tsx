import { createAdminClient, listBatches, listBatchStages } from '@lps/db';
import { PROCESS_STEPS, stagesOf, summarizeBatch, type Batch, type ProcessStep } from '@lps/domain';
import { ChevronRight, Plus, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { NewBatchDrawer } from '@/components/batches/new-batch-drawer';
import { Topbar } from '@/components/layout/topbar';
import { Button, Card, EmptyState, LinkButton, PageHeader, Status, Table, type Tone } from '@/components/ui';
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select';
import { retryBatchAction } from './actions';

const STATUS: Record<Batch['status'], { label: string; tone: Tone; detail: string }> = {
  buscando: { label: 'Buscando', tone: 'warning', detail: 'Consultando o Google Maps' },
  analisando: { label: 'Analisando', tone: 'warning', detail: 'Analisando os negócios' },
  concluido: { label: 'Concluído', tone: 'success', detail: '' },
  erro: { label: 'Erro', tone: 'danger', detail: '' },
};

const ABBR: Record<ProcessStep, string> = { revisar: 'REV', material: 'MAT', abordar: 'ABO', aguardar: 'AGU', conversa: 'CON', vendido: 'VEN' };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ novo?: string; local?: string; etapa?: string }> }) {
  const { novo, local, etapa } = await searchParams;
  const db = createAdminClient();
  const [batches, stages] = await Promise.all([listBatches(db), listBatchStages(db)]);
  const locations = [...new Map(batches.map((b) => [b.location_key, b.location])).entries()];

  const rows = batches
    .filter((b) => !local || b.location_key === local)
    .filter((b) => {
      if (!etapa) return true;
      const wanted = stagesOf(etapa as ProcessStep);
      return stages.some((s) => s.batch_id === b.id && wanted.includes(s.stage));
    })
    .map((batch) => ({ batch, summary: summarizeBatch(stages.filter((s) => s.batch_id === batch.id)) }));

  return (
    <>
      <Topbar crumbs={[{ label: 'Batches' }]} />
      <main className="p-4 lg:p-6">
        <PageHeader
          title="Batches"
          description="Cada batch é uma busca por região e tipo de negócio. Clique em um batch para revisar os leads."
          actions={
            <>
              <form>
                {etapa && <input type="hidden" name="etapa" value={etapa} />}
                <AutoSubmitSelect name="local" defaultValue={local ?? ''} aria-label="Localização" className="w-52">
                  <option value="">Localização: Todas</option>
                  {locations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </AutoSubmitSelect>
              </form>
              <LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton>
            </>
          }
        />
        {etapa && (
          <p className="mb-4 text-sm text-muted-foreground">
            Mostrando batches com leads em {PROCESS_STEPS.find((s) => s.key === etapa)?.label}.{' '}
            <Link href="/painel/batches" className="underline">Ver todos</Link>
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState title="Nenhum batch por aqui" description="Crie um batch para buscar negócios de uma região." actions={<LinkButton href="/painel/batches?novo=1"><Plus />Novo batch</LinkButton>} />
        ) : (
          <Card>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <h2 className="font-medium">Todos os batches</h2>
              <span className="text-muted-foreground">{rows.length} {rows.length === 1 ? 'batch' : 'batches'}</span>
            </div>
            <Table head={['Localização', 'Tipo de negócio', 'Quantidade', 'Status', 'Leads por etapa', 'Próxima ação', '']}>
              {rows.map(({ batch, summary }) => {
                const status = STATUS[batch.status];
                const href = `/painel/batches/${batch.id}/revisar`;
                const started = PROCESS_STEPS.some((s) => summary.counts[s.key] > 0);
                return (
                  <tr key={batch.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium"><Link href={href}>{batch.location}</Link></td>
                    <td className="px-4 py-3 text-muted-foreground">{batch.business_type}</td>
                    <td className="px-4 py-3">{batch.quantity}</td>
                    <td className="px-4 py-3"><Status tone={status.tone}>{status.label}</Status></td>
                    <td className="px-4 py-3">
                      {started ? (
                        <div className="flex gap-3">
                          {PROCESS_STEPS.map((s) => (
                            <span key={s.key} className="text-center">
                              <span className="block text-sm">{summary.counts[s.key]}</span>
                              <span className="block font-mono text-[10px] text-muted-foreground">{ABBR[s.key]}</span>
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
                      ) : <Link href={href} aria-label="Abrir batch"><ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}
      </main>
      {novo && <NewBatchDrawer />}
    </>
  );
}
