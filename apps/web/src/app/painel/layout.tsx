import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ShellProvider, SIDEBAR_COOKIE } from '@/components/layout/shell';
import { Sidebar } from '@/components/layout/sidebar';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  return (
    <ShellProvider initialCollapsed={collapsed}>
      <div className="flex min-h-full">
        <Sidebar email={data.user.email ?? 'Conta individual'} />
        <div className="my-2 mr-2 min-w-0 flex-1 overflow-clip rounded-card bg-background max-lg:m-0 max-lg:rounded-none">{children}</div>
      </div>
    </ShellProvider>
  );
}
