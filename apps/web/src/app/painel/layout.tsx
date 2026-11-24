import { createAdminClient, profilesOrEmpty } from '@lps/db';
import { cookies } from 'next/headers';
import { Suspense, type ReactNode } from 'react';
import { NavProgress } from '@/components/layout/nav-progress';
import { ShellProvider, SIDEBAR_COOKIE } from '@/components/layout/shell';
import { Sidebar } from '@/components/layout/sidebar';
import { TooltipLayer } from '@/components/ui/tooltip';
import { WorkspaceProvider } from '@/components/layout/workspace';
import { authedDb, getSession } from '@/lib/auth';
import { summarizeWhatsApp } from '@/lib/connections';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, workspaces, workspace } = await getSession();
  const db = await authedDb();
  const [{ data: conn }, profiles] = await Promise.all([
    db.from('whatsapp_connection').select('state').maybeSingle(),
    profilesOrEmpty(createAdminClient(), [user.id]),
  ]);
  const profile = profiles.get(user.id);
  const whatsapp = summarizeWhatsApp((conn?.state as string | undefined) ?? null);
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  return (
    <ShellProvider initialCollapsed={collapsed}>
      <WorkspaceProvider id={workspace.id}>
        <Suspense><NavProgress /></Suspense>
        <TooltipLayer />
        {/* A página não rola: o corpo tem a altura da tela e a rolagem acontece dentro dele. */}
        <div className="flex h-dvh overflow-hidden">
          <Sidebar
            user={{ id: user.id, name: profile?.name || user.email.split('@')[0] || 'Conta individual', avatarUrl: profile?.avatarUrl ?? null }}
            whatsapp={whatsapp}
            workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
            current={workspace.id}
            isAdmin={isAdmin}
          />
          <div className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-card [scrollbar-color:#ffffff26_transparent] [scrollbar-width:thin] bg-background max-lg:m-0 max-lg:rounded-none">{children}</div>
        </div>
      </WorkspaceProvider>
    </ShellProvider>
  );
}
