import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { authedDb } from '@/lib/auth';
import { summarize } from '@/lib/connections';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const db = await authedDb();
  const { data: conn } = await db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle();
  const connections = summarize((conn?.state as string | undefined) ?? null);
  return (
    <div className="flex min-h-full">
      <Sidebar email={data.user.email ?? 'Conta individual'} connections={connections} />
      <div className="my-2 mr-2 min-w-0 flex-1 rounded-card bg-background max-lg:m-0 max-lg:rounded-none">{children}</div>
    </div>
  );
}
