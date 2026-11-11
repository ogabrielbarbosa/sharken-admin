import { secretMatches } from '@lps/config';
import { contractByDocToken, createAdminClient, recordContractSigned, updateContract } from '@lps/db';
import { mergeContractStatus } from '@lps/domain';
import { getContractProvider } from '@lps/integrations';

export async function POST(request: Request) {
  if (!secretMatches(new URL(request.url).searchParams.get('secret'), process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  const event = getContractProvider().normalizeWebhook(await request.json().catch(() => null));
  if (!event) return Response.json({ ok: true });

  const db = createAdminClient();
  const contract = await contractByDocToken(db, event.docToken);
  if (contract) {
    const status = mergeContractStatus(contract.status, event.status);
    if (status !== contract.status) await updateContract(db, contract.id, { status });
    if (status === 'assinado' && contract.status !== 'assinado') await recordContractSigned(db, contract.id);
  }
  return Response.json({ ok: true });
}
