import type { ReactNode } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { batchLabel, loadBatchContext } from '@/lib/batch-context';

export default async function BatchLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { batch } = await loadBatchContext(id);
  return (
    <>
      <Topbar crumbs={[{ label: 'Batches', href: '/painel/batches' }, { label: batchLabel(batch) }]} />
      <main className="p-4 lg:p-6">{children}</main>
    </>
  );
}
