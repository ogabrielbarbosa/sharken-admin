import { listPossibleDuplicates, type DuplicatePair } from '@lps/db';
import { columnOf, PIPELINE_COLUMNS } from '@lps/domain';
import { Copy, GitMerge, X } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { Button, Card, EmptyState } from '@/components/ui';
import { InstagramIcon, mapsUrl, instagramUrl } from '@/components/leads/lead-links';
import { authedDb } from '@/lib/auth';
import { dismissDuplicateAction, mergeDuplicateAction } from '../actions';

const columnLabel = (stage: DuplicatePair['a']['stage']) => PIPELINE_COLUMNS.find((c) => c.key === columnOf(stage))?.label ?? stage;

function Side({ lead }: { lead: DuplicatePair['a'] }) {
  const insta = instagramUrl(lead);
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium">{lead.name}</p>
      <p className="truncate text-xs text-muted-foreground">{lead.city} · {columnLabel(lead.stage)}</p>
      <p className="mt-1 flex flex-wrap gap-3 text-xs">
        {lead.place_id && <a href={mapsUrl(lead)} target="_blank" rel="noreferrer" className="text-brand-soft hover:underline">Google Maps</a>}
        {insta && <a href={insta} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-soft hover:underline"><InstagramIcon />Instagram</a>}
        {lead.phone_e164 && <span className="text-muted-foreground">+{lead.phone_e164}</span>}
      </p>
    </div>
  );
}

/** Leads com nome parecido na mesma cidade, para o Gabriel juntar ou separar. */
export default async function DuplicatesPage() {
  const pairs = await listPossibleDuplicates(await authedDb());
  return (
    <>
      <Topbar crumbs={[{ label: 'Leads', href: '/painel/leads' }, { label: 'Batches', href: '/painel/batches' }, { label: 'Possíveis duplicados' }]} />
      <main className="p-4 lg:p-6">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Nome parecido na mesma cidade, sem @, telefone, site ou lugar no Maps em comum. Ao juntar, fica o lead que já andou mais na pipeline, com os dados e os batches dos dois.
        </p>
        {pairs.length === 0 ? (
          <EmptyState icon={<Copy />} title="Nenhum possível duplicado" description="Quando dois leads parecerem o mesmo negócio, eles aparecem aqui." />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {pairs.map(({ a, b, similarity }) => (
                <li key={`${a.id}:${b.id}`} className="flex flex-col gap-3 px-4 py-3 text-sm lg:flex-row lg:items-center lg:gap-6">
                  <Side lead={a} />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-tip="Semelhança dos nomes">{Math.round(similarity * 100)}%</span>
                  <Side lead={b} />
                  <span className="flex shrink-0 gap-2">
                    <form action={mergeDuplicateAction}>
                      <input type="hidden" name="a" value={a.id} />
                      <input type="hidden" name="b" value={b.id} />
                      <Button type="submit" variant="outline"><GitMerge />Juntar</Button>
                    </form>
                    <form action={dismissDuplicateAction}>
                      <input type="hidden" name="a" value={a.id} />
                      <input type="hidden" name="b" value={b.id} />
                      <Button type="submit" variant="ghost"><X />Não são o mesmo</Button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
