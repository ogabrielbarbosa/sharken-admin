import { secretMatches } from '@lps/config';
import { chargeByPayment, createAdminClient, insertCharge, serviceBySubscription, updateCharge } from '@lps/db';
import { planPaymentEvent, type AsaasPayment } from '@lps/domain';

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('asaas-access-token'), process.env.WEBHOOK_SECRET)) {
    return Response.json({ error: 'não autorizado' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { event?: string; payment?: AsaasPayment };
  if (!body.event || !body.payment?.id) return Response.json({ ok: true });

  const db = createAdminClient();
  const existing = await chargeByPayment(db, body.payment.id);
  const service = !existing && body.payment.subscription ? await serviceBySubscription(db, body.payment.subscription) : null;
  const plan = planPaymentEvent(body.event, body.payment, existing, service?.id ?? null);
  if (plan.action === 'update' && existing) await updateCharge(db, existing.id, { status: plan.status });
  if (plan.action === 'create') await insertCharge(db, plan.row);
  return Response.json({ ok: true });
}
