import { secretMatches } from '@lps/config';
import { contractByDocToken, createAdminClient, updateContract } from '@lps/db';
import { nextContractStatus } from '@lps/domain';

export async function POST(request: Request) {
  if (!secretMatches(new URL(request.url).searchParams.get('secret'), process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { token?: string; event_type?: string; status?: string };
  if (!body.token) return Response.json({ ok: true });

  const db = createAdminClient();
  const contract = await contractByDocToken(db, body.token);
  if (contract) {
    const status = nextContractStatus(contract.status, body);
    if (status !== contract.status) await updateContract(db, contract.id, { status });
  }
  return Response.json({ ok: true });
}
