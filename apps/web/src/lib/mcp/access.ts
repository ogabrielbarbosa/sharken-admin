import { createAdminClient, isPlatformAdmin, listUserWorkspaces, type Access } from '@lps/db';

/**
 * Valida o token do Supabase (OAuth ou sessão) e monta o acesso do usuário: admin da plataforma vê todos os
 * workspaces; os demais, só os seus. Usa o cliente admin comum (o só de leitura não tem `auth`).
 */
export async function resolveAccess(token: string): Promise<Access | null> {
  const db = createAdminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const userId = data.user.id;
  const isAdmin = await isPlatformAdmin(db, userId);
  const workspaces = await listUserWorkspaces(db, userId, isAdmin);
  return { userId, isAdmin, workspaces: workspaces.map(({ id, name, slug, role }) => ({ id, name, slug, role })) };
}

