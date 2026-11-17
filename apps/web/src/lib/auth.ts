import { getEnv } from '@lps/config';
import { createAdminClient, isPlatformAdmin, listUserWorkspaces, scopeDb, type Workspace } from '@lps/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createServerClient } from './supabase/server';

/** Cookie com o workspace escolhido. Só guarda o id: a cada requisição confere se o usuário tem acesso. */
export const WORKSPACE_COOKIE = 'workspace';

export type Session = {
  user: { id: string; email: string };
  /** Administrador da plataforma: vê todos os workspaces e alterna entre eles. */
  isAdmin: boolean;
  /** Para quem não é administrador, só o workspace em uso: o usuário não sabe dos outros. */
  workspaces: Workspace[];
  workspace: Workspace;
};

/** Usuário logado e o workspace em uso (o do cookie, se tiver acesso; senão o primeiro). */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');
  const db = createAdminClient();
  const isAdmin = await isPlatformAdmin(db, data.user.id);
  const all = await listUserWorkspaces(db, data.user.id, isAdmin);
  if (!all.length) redirect('/login?erro=sem-workspace');
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = all.find((w) => w.id === chosen) ?? all[0]!;
  return { user: { id: data.user.id, email: data.user.email ?? '' }, isAdmin, workspaces: isAdmin ? all : [workspace], workspace };
});

/** Confere a sessão e devolve o cliente com service role preso ao workspace em uso. */
export async function authedDb() {
  const { workspace } = await getSession();
  return scopeDb(createAdminClient(), workspace.id);
}

/** Nome, empresa e limite diário do workspace, com o .env como padrão. */
export function workspaceProfile(workspace: Workspace) {
  const env = getEnv();
  return {
    // Sem nome configurado, nunca usa o do Gabriel fora do workspace dele.
    signer: workspace.signature_name?.trim() || (workspace.slug === 'sharken' ? process.env.CRM_SIGNATURE_NAME || 'Gabriel' : workspace.name),
    company: workspace.commercial_name?.trim() || env.COMMERCIAL_NAME,
    dailyLimit: workspace.daily_first_contact_limit ?? env.DAILY_FIRST_CONTACT_LIMIT,
  };
}
