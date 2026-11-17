import { createAdminClient, listUserWorkspaces, scopeDb, type Workspace } from '@lps/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createServerClient } from './supabase/server';

/** Cookie com o workspace escolhido. Só guarda o id: a cada requisição confere se o usuário é membro. */
export const WORKSPACE_COOKIE = 'workspace';

export type Session = {
  user: { id: string; email: string };
  workspaces: Workspace[];
  workspace: Workspace;
};

/** Usuário logado, workspaces de que é membro e o workspace em uso (o do cookie, ou o primeiro). */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const workspaces = await listUserWorkspaces(createAdminClient(), data.user.id);
  if (!workspaces.length) redirect('/login?erro=sem-workspace');
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === chosen) ?? workspaces[0]!;
  return { user: { id: data.user.id, email: data.user.email ?? '' }, workspaces, workspace };
});

/** Confere a sessão e devolve o cliente com service role preso ao workspace em uso. */
export async function authedDb() {
  const { workspace } = await getSession();
  return scopeDb(createAdminClient(), workspace.id);
}
