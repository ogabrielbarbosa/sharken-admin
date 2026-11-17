import { secretMatches } from '@lps/config';
import { createAdminClient } from '@lps/db';
import { todayInSaoPaulo } from '@lps/domain';

/** Marca como vencidas as cobranças da AbacatePay pendentes com vencimento passado (a AbacatePay não avisa atraso). */
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!secretMatches(token, process.env.CRON_SECRET)) return Response.json({ error: 'não autorizado' }, { status: 401 });
  const { data, error } = await createAdminClient().rpc('mark_overdue_charges', { today: todayInSaoPaulo() });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ overdue: data });
}
