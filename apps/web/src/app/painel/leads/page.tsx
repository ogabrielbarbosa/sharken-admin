import { LEADS_PAGE, listAllLeads, listBatches, NO_BATCH } from '@lps/db';
import { BATCH_SOURCE_LABEL, batchSource, columnOf, formatPhone, PIPELINE_COLUMNS, prospectedNiches, sameNiche } from '@lps/domain';
import { workspaceHasApify } from '@lps/integrations';
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { NewLeadDrawer } from '@/components/leads/new-lead-drawer';
import { Topbar } from '@/components/layout/topbar';
import { LeadsHeader } from '@/components/leads/leads-header';
import { QuickLinks } from '@/components/leads/quick-links';
import { Badge, Card, EmptyState, Input, LinkButton, Select, Table } from '@/components/ui';
import { authedDb, getSession } from '@/lib/auth';
import { batchLabel } from '@/lib/batch-context';
import { formatDate } from '@/lib/lead-labels';

type Params = { q?: string; batch?: string; nicho?: string; fonte?: string; etapa?: string; pagina?: string; novo?: string };
const HERE = '/painel/leads';

/** Todos os leads do workspace, com o que foi buscado, a fonte e os batches em que cada um apareceu. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const column = PIPELINE_COLUMNS.find((c) => c.key === params.etapa);
  const page = Math.max(1, Math.floor(Number(params.pagina)) || 1);
  const db = await authedDb();
  const batches = await listBatches(db);
  const byId = new Map(batches.map((b) => [b.id, b]));

  const noBatch = params.batch === NO_BATCH;
  const filtered = !!(params.batch || params.nicho || params.fonte);
  const batchIds = batches
    .filter((b) => (!params.batch || b.id === params.batch) && (!params.nicho || sameNiche(b.business_type, params.nicho)) && (!params.fonte || batchSource(b) === params.fonte))
    .map((b) => b.id);
  const { workspace } = await getSession();
  const [{ leads, total }, apifyConnected] = await Promise.all([
    listAllLeads(db, { q, noBatch: noBatch && !params.nicho && !params.fonte, batchIds: filtered && !(noBatch && !params.nicho && !params.fonte) ? batchIds : undefined, stages: column?.stages, page }),
    params.novo ? workspaceHasApify(workspace.id) : true,
  ]);
  const pages = Math.max(1, Math.ceil(total / LEADS_PAGE));
  const href = (patch: Partial<Params>) => {
    const next = new URLSearchParams(Object.entries({ ...params, novo: undefined, ...patch }).filter((e): e is [string, string] => !!e[1]));
    return next.size ? `${HERE}?${next}` : HERE;
  };

  return (
    <>
      <Topbar crumbs={[{ label: 'Leads' }]} actions={<LinkButton href={href({ novo: '1' })}><Plus /><span className="max-sm:sr-only">Novo lead</span></LinkButton>} />
      <LeadsHeader current="leads" />
      <main className="p-4 lg:p-6">
        <form className="mb-4 flex flex-col gap-2 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input name="q" type="search" defaultValue={q} placeholder="Buscar lead pelo nome…" aria-label="Buscar lead" className="w-full pl-8" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Select
              autoSubmit
              name="batch"
              aria-label="Batch"
              defaultValue={params.batch ?? ''}
              className="w-full sm:w-44"
              options={[
                { value: '', label: 'Todos os batches' },
                { value: NO_BATCH, label: 'Sem batch' },
                ...batches.map((b) => ({ value: b.id, label: `${batchLabel(b)} · ${formatDate(b.created_at)}` })),
              ]}
            />
            <Select autoSubmit name="nicho" aria-label="Nicho buscado" defaultValue={params.nicho ?? ''} className="w-full sm:w-40" options={[{ value: '', label: 'Todos os nichos' }, ...prospectedNiches(batches).map((n) => ({ value: n, label: n }))]} />
            <Select autoSubmit name="fonte" aria-label="Fonte do batch" defaultValue={params.fonte ?? ''} className="w-full sm:w-40" options={[{ value: '', label: 'Todas as fontes' }, ...Object.entries(BATCH_SOURCE_LABEL).map(([value, label]) => ({ value, label }))]} />
            <Select autoSubmit name="etapa" aria-label="Etapa" defaultValue={params.etapa ?? ''} className="w-full sm:w-44" options={[{ value: '', label: 'Todas as etapas' }, ...PIPELINE_COLUMNS.map((c) => ({ value: c.key, label: c.label }))]} />
          </div>
        </form>
        {leads.length === 0 ? (
          <EmptyState icon={<Users />} title="Nenhum lead por aqui" description={q || filtered || column ? 'Nenhum lead com esses filtros.' : 'Cadastre um lead ou crie um batch para buscar negócios.'} actions={<LinkButton href={q || filtered || column ? HERE : `${HERE}?novo=1`}>{q || filtered || column ? 'Limpar filtros' : 'Novo lead'}</LinkButton>} />
        ) : (
          <Card>
            <Table head={['Lead', 'Links', 'Tipo de negócio', <span key="f" className="whitespace-nowrap">Encontrado em</span>, 'Batch', 'Etapa']}>
              {leads.map((lead) => {
                const origin = lead.batch_id ? byId.get(lead.batch_id) : undefined;
                const found = [...new Set([lead.batch_id, ...lead.found.map((f) => f.batch_id)])].flatMap((id) => (id && byId.has(id) ? [byId.get(id)!] : []));
                const niches = [...new Set(found.map((b) => b.business_type))];
                return (
                  <tr key={lead.id} className="align-top">
                    <td className="min-w-52 px-4 py-3">
                      <Link href={`/painel/leads/${lead.id}`} className="font-medium transition-colors hover:text-brand-light">{lead.name}</Link>
                      <p className="text-xs text-muted-foreground">{[lead.city, lead.phone_raw ?? (lead.phone_e164 && formatPhone(lead.phone_e164))].filter(Boolean).join(' · ') || '—'}</p>
                      {lead.rating !== null && <p className="text-xs text-subtle-foreground">Nota {String(lead.rating).replace('.', ',')} · {lead.reviews_count} avaliações</p>}
                    </td>
                    <td className="px-4 py-3"><QuickLinks lead={lead} /></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {niches.length ? <span tabIndex={0} data-tip={`Nicho buscado: ${niches.join(', ')}`} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60">{lead.business_type ?? '—'}</span> : (lead.business_type ?? '—')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{origin ? BATCH_SOURCE_LABEL[batchSource(origin)] : 'Manual'}</td>
                    <td className="min-w-44 px-4 py-3">
                      {found.length ? found.map((b) => <Link key={b.id} href={`/painel/batches/${b.id}?lead=${lead.id}`} className="block text-brand-soft hover:underline">{batchLabel(b)} <span className="text-xs text-muted-foreground">{formatDate(b.created_at)}</span></Link>) : <span className="text-muted-foreground">Sem batch</span>}
                    </td>
                    <td className="px-4 py-3"><Badge>{PIPELINE_COLUMNS.find((c) => c.key === columnOf(lead.stage))!.label}</Badge></td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}
        {(pages > 1 || page > 1) && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">Página {page} de {pages}</span>
            {page > 1 && <LinkButton variant="outline" href={href({ pagina: String(Math.min(page - 1, pages)) })}><ChevronLeft />Anterior</LinkButton>}
            {page < pages && <LinkButton variant="outline" href={href({ pagina: String(page + 1) })}>Próxima<ChevronRight /></LinkButton>}
          </div>
        )}
      </main>
      {params.novo && <NewLeadDrawer apifyConnected={apifyConnected} closeHref={href({})} batches={batches.map((b) => ({ value: b.id, label: `${batchLabel(b)} · ${formatDate(b.created_at)}` }))} />}
    </>
  );
}
