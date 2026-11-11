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
      {/* A página não rola: o corpo tem a altura da tela e a rolagem acontece dentro dele. */}
      <div className="flex h-dvh overflow-hidden">
        <Sidebar email={data.user.email ?? 'Conta individual'} />
        <div className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-card [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin] bg-background max-lg:m-0 max-lg:rounded-none">{children}</div>
      </div>
    </ShellProvider>
  );
}
