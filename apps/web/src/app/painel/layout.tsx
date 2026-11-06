import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  return (
    <div className="flex min-h-full">
      <Sidebar email={data.user.email ?? 'Conta individual'} />
      <div className="my-2 mr-2 min-w-0 flex-1 rounded-card bg-background max-lg:m-0 max-lg:rounded-none">{children}</div>
    </div>
  );
}
