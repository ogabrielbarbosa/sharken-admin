import type { Db } from './client';

export type Invite = { id: string; workspace_id: string; email: string; role: 'owner' | 'member'; created_at: string };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Conta já existente com esse e-mail (busca paginada na lista de usuários do Auth). */
export async function findUserByEmail(db: Db, email: string) {
  const target = normalizeEmail(email);
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Adiciona a pessoa ao workspace. Com conta, entra na hora; sem conta, fica um convite pendente
 * e ela entra quando criar a conta com esse e-mail. Devolve o que aconteceu.
 */
export async function inviteToWorkspace(
  db: Db,
  input: { workspaceId: string; email: string; role: 'owner' | 'member'; invitedBy?: string },
): Promise<'adicionado' | 'convidado'> {
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(db, email);
  if (user) {
    const { error } = await db.from('workspace_members').upsert(
      { workspace_id: input.workspaceId, user_id: user.id, role: input.role },
      { onConflict: 'workspace_id,user_id' },
    );
    if (error) throw new Error(error.message);
    return 'adicionado';
  }
  const { error } = await db.from('workspace_invites').upsert(
    { workspace_id: input.workspaceId, email, role: input.role, invited_by: input.invitedBy ?? null, accepted_at: null },
    { onConflict: 'workspace_id,email' },
  );
  if (error) throw new Error(error.message);
  return 'convidado';
}

export async function pendingInvites(db: Db, filter: { email?: string; workspaceId?: string }): Promise<Invite[]> {
  let query = db.from('workspace_invites').select('id, workspace_id, email, role, created_at').is('accepted_at', null);
  if (filter.email) query = query.eq('email', normalizeEmail(filter.email));
  if (filter.workspaceId) query = query.eq('workspace_id', filter.workspaceId);
  const { data, error } = await query.order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Invite[];
}

/** Põe o usuário nos workspaces para os quais o e-mail dele foi convidado. Repetir é seguro. */
export async function acceptInvites(db: Db, user: { id: string; email: string }): Promise<number> {
  const invites = await pendingInvites(db, { email: user.email });
  for (const inv of invites) {
    const { error } = await db.from('workspace_members').upsert(
      { workspace_id: inv.workspace_id, user_id: user.id, role: inv.role },
      { onConflict: 'workspace_id,user_id' },
    );
    if (error) throw new Error(error.message);
    await db.from('workspace_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);
  }
  return invites.length;
}
