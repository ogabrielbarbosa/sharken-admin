import type { Db } from './client';
import { fetchAll } from './fetch-all';

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

// Execuções iniciadas pelo Sharken. O custo vem do Apify; aqui fica só de quem é cada execução.

export type ApifyRunPurpose = 'maps' | 'google' | 'profiles' | 'instagram' | 'instagram_post' | 'instagram_media' | 'extract';
export type ApifyRunRecord = { run_id: string; created_at: string; workspace_id: string; actor: string; purpose: ApifyRunPurpose; batch_id: string | null; lead_id: string | null; backfilled: boolean };

/** Nunca lança: a busca já foi paga e não pode parar porque o controle de custo falhou. */
export async function recordApifyRun(db: Db, run: { run_id: string; workspace_id: string; actor: string; purpose: ApifyRunPurpose; batch_id?: string | null; lead_id?: string | null }) {
  try {
    unwrap(await db.from('apify_runs').upsert({ ...run, backfilled: false }, { onConflict: 'run_id' }));
  } catch (err) {
    console.error(`[apify] execução ${run.run_id} sem registro de custo: ${(err as Error).message}`);
  }
}
export async function listApifyRuns(db: Db, workspaceId: string): Promise<ApifyRunRecord[]> {
  return fetchAll<ApifyRunRecord>(async (from, to) =>
    (await db.from('apify_runs').select('*').eq('workspace_id', workspaceId).order('created_at').order('run_id').range(from, to)) as { data: ApifyRunRecord[] | null; error: { message: string } | null });
}
