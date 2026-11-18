import type { Db } from './client';

const unwrap = <T>({ data, error }: { data: unknown; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// Token do Apify por workspace. Só com o cliente sem escopo (service role): a tabela não tem acesso para membros.

export type WorkspaceApify = { workspace_id: string; updated_at: string; token: string; username: string | null; plan: string | null };

export async function getWorkspaceApify(db: Db, workspaceId: string) {
  return unwrap<WorkspaceApify | null>(await db.from('workspace_apify').select().eq('workspace_id', workspaceId).maybeSingle());
}
export async function getApifyToken(db: Db, workspaceId: string): Promise<string | null> {
  return (await getWorkspaceApify(db, workspaceId))?.token ?? null;
}
export async function saveWorkspaceApify(db: Db, row: Omit<WorkspaceApify, 'updated_at'>) {
  unwrap(await db.from('workspace_apify').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' }));
}
export async function deleteWorkspaceApify(db: Db, workspaceId: string) {
  unwrap(await db.from('workspace_apify').delete().eq('workspace_id', workspaceId));
}
