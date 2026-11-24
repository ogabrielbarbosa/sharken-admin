import { createAdminClient, getApifyToken, listApifyRuns, type WorkspaceApify } from '@lps/db';
import { summarizeApifyCosts } from '@lps/domain';
import { fetchApifyUsage, SHARKEN_ACTORS } from '@lps/integrations';
import { unstable_cache } from 'next/cache';

/** Cinco minutos de cache; trocar o token muda a chave. O token é lido dentro, para não entrar na chave. */
const cachedUsage = unstable_cache(
  async (workspaceId: string, _tokenVersion: string) => {
    const token = await getApifyToken(createAdminClient(), workspaceId);
    if (!token) throw new Error('Conecte sua conta do Apify em Configurações › Apify.');
    return { ...(await fetchApifyUsage(token)), readAt: new Date().toISOString() };
  },
  ['apify-usage'],
  { revalidate: 300 },
);

export async function apifyCosts(apify: WorkspaceApify) {
  const db = createAdminClient();
  const [usage, tracked] = await Promise.all([cachedUsage(apify.workspace_id, apify.updated_at), listApifyRuns(db, apify.workspace_id)]);
  const summary = summarizeApifyCosts(usage.runs, tracked, SHARKEN_ACTORS);
  const ids = summary.byBatch.map((b) => b.batchId);
  const { data, error } = await db.from('batches').select('id, business_type, location').eq('workspace_id', apify.workspace_id).in('id', ids);
  if (error) throw new Error(error.message);
  const names = new Map((data as { id: string; business_type: string; location: string }[]).map((b) => [b.id, `${b.business_type} · ${b.location}`]));
  return { usage, summary, batchName: (id: string) => names.get(id) ?? 'Batch excluído' };
}

/** Todos os dias do ciclo até hoje (horário de Brasília), para o gráfico não pular os sem gasto. */
export function cycleDays(startIso: string, now = new Date()): string[] {
  const days: string[] = [];
  // O ciclo do Apify vira à meia-noite UTC, 21h do dia anterior em Brasília.
  const end = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  for (let t = new Date(startIso).getTime() - 3 * 3_600_000; ; t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (day > end) return days;
    days.push(day);
  }
}
