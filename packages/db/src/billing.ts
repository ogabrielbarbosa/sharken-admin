import { abacatePaidAt, nextAbacateChargeStatus, planAbacateEvent, todayInSaoPaulo, type AbacateEvent, type ChargeStatus, type Cycle } from '@lps/domain';
import type { Db } from './client';
import { recordChargePaid, updateService, type ChargeRecord, type ServiceRecord } from './clients';

const unwrap = <T>({ data, error }: { data: unknown; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

// ---------------------------------------------------------------------------------------------
// Credencial da AbacatePay por workspace. Só com o cliente sem escopo (service role): a tabela não
// tem acesso para membros.

export type WorkspaceBilling = { workspace_id: string; updated_at: string; api_key: string; dev_mode: boolean; webhook_id: string | null; webhook_secret: string };

export async function getWorkspaceBilling(db: Db, workspaceId: string) {
  return unwrap<WorkspaceBilling | null>(await db.from('workspace_billing').select().eq('workspace_id', workspaceId).maybeSingle());
}
export async function saveWorkspaceBilling(db: Db, row: Omit<WorkspaceBilling, 'updated_at'>) {
  unwrap(await db.from('workspace_billing').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' }));
}
export async function deleteWorkspaceBilling(db: Db, workspaceId: string) {
  unwrap(await db.from('workspace_billing').delete().eq('workspace_id', workspaceId));
}

// ---------------------------------------------------------------------------------------------
// Catálogo de serviços do workspace.

export type CatalogItem = { id: string; created_at: string; name: string; kind: 'unico' | 'recorrente'; amount_cents: number; cycle: Cycle | null; description: string | null; active: boolean };
export type CatalogInput = Pick<CatalogItem, 'name' | 'kind' | 'amount_cents' | 'cycle' | 'description'>;

export async function listCatalog(db: Db, opts: { onlyActive?: boolean } = {}) {
  let q = db.from('service_catalog').select().order('active', { ascending: false }).order('name');
  if (opts.onlyActive) q = q.eq('active', true);
  return unwrap<CatalogItem[]>(await q);
}
export async function createCatalogItem(db: Db, row: CatalogInput) {
  unwrap(await db.from('service_catalog').insert({ ...row, cycle: row.kind === 'recorrente' ? row.cycle : null }));
}
export async function updateCatalogItem(db: Db, id: string, patch: Partial<CatalogInput & { active: boolean }>) {
  const fixed = patch.kind === 'unico' ? { ...patch, cycle: null } : patch;
  unwrap(await db.from('service_catalog').update(fixed).eq('id', id));
}

// ---------------------------------------------------------------------------------------------
// Avisos da AbacatePay. `db` já vem preso ao workspace dono do webhook: nada de outro workspace é tocado.

async function chargesWhere(db: Db, column: 'abacate_checkout_id' | 'abacate_payment_id', value: string) {
  return unwrap<ChargeRecord[]>(await db.from('charges').select().eq(column, value).order('created_at'));
}
async function serviceByCheckout(db: Db, checkoutId: string) {
  return unwrap<ServiceRecord | null>(await db.from('services').select().eq('abacate_checkout_id', checkoutId).maybeSingle());
}
async function serviceBySubscription(db: Db, subscriptionId: string) {
  return unwrap<ServiceRecord | null>(await db.from('services').select().eq('abacate_subscription_id', subscriptionId).maybeSingle());
}
const OPEN: ChargeStatus[] = ['pendente', 'vencido'];

export type AbacateResult = 'ignorado' | 'pago' | 'cancelado' | 'vencido' | 'assinatura_cancelada';

/** Aplica um aviso da AbacatePay às cobranças do workspace, sem duplicar nem regredir. */
export async function applyAbacateEvent(db: Db, evt: AbacateEvent, now: Date = new Date()): Promise<AbacateResult> {
  const plan = planAbacateEvent(evt);
  const paidAt = abacatePaidAt(evt, now);

  if (plan.action === 'checkout_paid' || plan.action === 'checkout_reversed') {
    const [charge] = await chargesWhere(db, 'abacate_checkout_id', plan.checkoutId);
    if (!charge) return 'ignorado';
    const status = nextAbacateChargeStatus(charge.status, plan);
    if (status === charge.status) return 'ignorado';
    unwrap(await db.from('charges').update({ status, ...(plan.action === 'checkout_paid' && plan.method ? { method: plan.method } : {}) }).eq('id', charge.id));
    if (status === 'pago') await recordChargePaid(db, charge.id, paidAt);
    return status === 'pago' ? 'pago' : 'cancelado';
  }

  if (plan.action === 'subscription_paid') {
    if ((await chargesWhere(db, 'abacate_payment_id', plan.paymentId)).length) return 'ignorado';
    const service = await serviceByCheckout(db, plan.checkoutId);
    if (!service) return 'ignorado';
    if (service.abacate_subscription_id !== plan.subscriptionId) await updateService(db, service.id, { abacate_subscription_id: plan.subscriptionId });
    // A cobrança em aberto do ciclo (a primeira, criada com o link, ou uma que falhou) vira paga; senão entra uma nova.
    const open = (await chargesWhere(db, 'abacate_checkout_id', plan.checkoutId)).find((c) => c.service_id === service.id && OPEN.includes(c.status));
    let chargeId: string;
    if (open) {
      unwrap(await db.from('charges').update({ status: 'pago', abacate_payment_id: plan.paymentId, ...(plan.method ? { method: plan.method } : {}) }).eq('id', open.id));
      chargeId = open.id;
    } else {
      chargeId = crypto.randomUUID();
      unwrap(await db.from('charges').insert({
        id: chargeId, service_id: service.id, description: service.name, amount_cents: plan.amountCents || service.amount_cents,
        due_date: todayInSaoPaulo(now), method: plan.method ?? service.payment_method ?? 'cartao', status: 'pago',
        abacate_checkout_id: plan.checkoutId, abacate_payment_id: plan.paymentId,
      }));
    }
    await recordChargePaid(db, chargeId, paidAt);
    return 'pago';
  }

  if (plan.action === 'subscription_failed') {
    const service = await serviceByCheckout(db, plan.checkoutId);
    if (!service) return 'ignorado';
    const charges = await chargesWhere(db, 'abacate_checkout_id', plan.checkoutId);
    if (charges.some((c) => c.abacate_payment_id === plan.installmentId)) return 'ignorado';
    const open = charges.find((c) => c.service_id === service.id && OPEN.includes(c.status));
    if (open) {
      if (open.status === 'vencido') return 'ignorado';
      unwrap(await db.from('charges').update({ status: 'vencido' }).eq('id', open.id));
    } else {
      unwrap(await db.from('charges').insert({
        service_id: service.id, description: service.name, amount_cents: plan.amountCents || service.amount_cents,
        due_date: todayInSaoPaulo(now), method: plan.method ?? service.payment_method ?? 'cartao', status: 'vencido',
        abacate_checkout_id: plan.checkoutId, abacate_payment_id: plan.installmentId,
      }));
    }
    return 'vencido';
  }

  if (plan.action === 'subscription_cancelled') {
    const service = (await serviceBySubscription(db, plan.subscriptionId)) ?? (plan.checkoutId ? await serviceByCheckout(db, plan.checkoutId) : null);
    if (!service?.abacate_subscription_id) return 'ignorado';
    // O serviço continua como está (quem decide cancelar é a pessoa); só deixa de ter assinatura ativa.
    await updateService(db, service.id, { abacate_subscription_id: null });
    return 'assinatura_cancelada';
  }

  return 'ignorado';
}
