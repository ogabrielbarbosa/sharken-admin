import { PageSkeleton } from '@/components/layout/page-skeleton';

const COLUMNS = [4, 3, 2, 2, 3];

/** O quadro carregando: colunas com alguns cartões em cinza. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex gap-3 overflow-hidden">
        {COLUMNS.map((cards, i) => (
          <div key={i} className={`w-72 shrink-0 space-y-2 rounded-card border border-border p-3 ${i > 0 ? 'max-md:hidden' : 'max-md:w-full'}`}>
            <span className="skeleton mb-3 block h-4 w-28" />
            {Array.from({ length: cards }, (_, j) => <span key={j} className="skeleton block h-[84px]" />)}
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
