import { listBatches, listBatchStages } from '@lps/db';
import { prospectedCities, prospectedNiches } from '@lps/domain';
import Link from 'next/link';
import { Topbar } from '@/components/layout/topbar';
import { ProspectMap } from '@/components/map/prospect-map';
import { Card } from '@/components/ui';
import { AutoSubmitSelect } from '@/components/ui/auto-submit-select';
import { authedDb } from '@/lib/auth';

/** Onde já houve batch, por cidade, com filtro por nicho. */
export default async function ProspectMapPage({ searchParams }: { searchParams: Promise<{ nicho?: string }> }) {
  const { nicho } = await searchParams;
  const db = await authedDb();
  const [batches, stages] = await Promise.all([listBatches(db), listBatchStages(db)]);
  const leads: Record<string, number> = {};
  for (const s of stages) leads[s.batch_id] = (leads[s.batch_id] ?? 0) + 1;
  const cities = prospectedCities(batches, leads, nicho || undefined);
  const niches = prospectedNiches(batches);

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Batches', href: '/painel/batches' }, { label: 'Mapa' }]}
        actions={
          <form>
            <AutoSubmitSelect name="nicho" defaultValue={nicho ?? ''} aria-label="Nicho" className="w-44 sm:w-60">
              <option value="">Nicho: Todos</option>
              {niches.map((n) => <option key={n} value={n}>{n}</option>)}
            </AutoSubmitSelect>
          </form>
        }
      />
      <main className="flex flex-col gap-4 p-4 lg:flex-row lg:p-6">
        <div className="min-w-0 flex-1">
          <ProspectMap cities={cities} height={560} />
        </div>
        <Card className="lg:w-80 lg:shrink-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
            <h2 className="font-medium">{nicho ? `Cidades com ${nicho}` : 'Cidades prospectadas'}</h2>
            <span className="text-muted-foreground">{cities.length}</span>
          </div>
          {cities.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum batch {nicho ? 'com esse nicho ' : ''}ainda.</p>
          ) : (
            <ul className="max-h-[500px] divide-y divide-border overflow-y-auto">
              {cities.map((c) => (
                <li key={c.location} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-medium">{c.location}</span><span className="tabular-nums text-muted-foreground">{c.leads} leads</span></div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {c.batches.map((b) => (
                      <li key={b.id}><Link href={`/painel/batches/${b.id}`} className="text-brand-soft hover:underline">{b.business_type}</Link> <span className="text-muted-foreground">· {b.leads} · {new Date(b.created_at).toLocaleDateString('pt-BR')}</span></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}
