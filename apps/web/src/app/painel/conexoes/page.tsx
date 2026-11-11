import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/topbar';
import { Card, Status } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { CONNECTIONS, summarize } from '@/lib/connections';

export default async function ConexoesPage() {
  const db = await authedDb();
  const { data: conn } = await db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle();
  const summary = new Map(summarize((conn?.state as string | undefined) ?? null).map((s) => [s.slug, s]));
  return (
    <>
      <Topbar crumbs={[{ label: 'Conexões' }]} />
      <div className="p-4 lg:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {CONNECTIONS.map((c) => {
            const s = summary.get(c.slug)!;
            return (
              <Link key={c.slug} href={`/painel/conexoes/${c.slug}`} className="group">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-neutral-600">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.provider}</p>
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{c.description}</p>
                  <Status tone={s.tone}>{s.status}</Status>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
