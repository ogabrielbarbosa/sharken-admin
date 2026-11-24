import { createAdminClient, profilesOrEmpty } from '@lps/db';
import { cache } from 'react';

/** Membro como aparece nos seletores de responsável. */
export type Member = { id: string; name: string; avatarUrl: string | null };

/** Membros do workspace. Quem ainda não tem nome aparece pelo e-mail. */
export const listMembers = cache(async (workspaceId: string): Promise<Member[]> => {
  const db = createAdminClient();
  const { data, error } = await db.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).order('created_at');
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const profiles = await profilesOrEmpty(db, ids);
  return Promise.all(ids.map(async (id) => {
    const p = profiles.get(id);
    const name = p?.name || (await db.auth.admin.getUserById(id)).data.user?.email || 'Membro sem nome';
    return { id, name, avatarUrl: p?.avatarUrl ?? null };
  }));
});
