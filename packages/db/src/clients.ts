import { phoneMatchCandidates, toMobileE164, type ChargeMethod, type ChargeStatus, CloseDealInput, ContractStatus } from '@lps/domain';
import type { Db } from './client';
import { logEvent } from './leads';
import { createContact, findContactByPhone, getContact } from './contacts';

export type ClientRecord = { id: string; created_at: string; lead_id: string | null; contact_id: string | null; legal_name: string; document: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; location: string | null; asaas_customer_id: string | null };
export type ServiceRecord = { id: string; client_id: string; name: string; kind: 'unico' | 'recorrente'; amount_cents: number; start_date: string; notes: string | null; status: 'ativo' | 'concluido' | 'cancelado'; asaas_subscription_id: string | null; payment_method: ChargeMethod | null; first_due_date: string | null; cycle: string | null };
export type ContractRecord = { id: string; service_id: string; status: ContractStatus; zapsign_doc_token: string | null; sign_url: string | null; status_at: string; sent_at: string | null };
export type ChargeRecord = { id: string; created_at: string; service_id: string; description: string; amount_cents: number; due_date: string; method: ChargeMethod; status: ChargeStatus; payment_url: string | null; asaas_payment_id: string | null; paid_at: string | null };

const unwrap = <T>({ data, error }: { data: unknown; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

export async function listClients(db: Db) {
  return unwrap<ClientRecord[]>(await db.from('clients').select().order('created_at', { ascending: false }));
}
export async function getClient(db: Db, id: string) {
  return unwrap<ClientRecord | null>(await db.from('clients').select().eq('id', id).maybeSingle());
}
export async function clientByContact(db: Db, contactId: string) {
  return unwrap<ClientRecord | null>(await db.from('clients').select().eq('contact_id', contactId).maybeSingle());
}
export async function clientsByLead(db: Db, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, string>();
  const rows = unwrap<{ id: string; lead_id: string }[]>(await db.from('clients').select('id, lead_id').in('lead_id', leadIds));
  return new Map(rows.map((r) => [r.lead_id, r.id]));
}
export async function createClient(db: Db, row: Partial<ClientRecord>) {
  return unwrap<ClientRecord>(await db.from('clients').insert(row).select().single());
}
export async function updateClient(db: Db, id: string, patch: Partial<ClientRecord>) {
  unwrap(await db.from('clients').update(patch).eq('id', id));
}

export async function listServices(db: Db, clientId?: string) {
  let q = db.from('services').select().order('created_at');
  if (clientId) q = q.eq('client_id', clientId);
  return unwrap<ServiceRecord[]>(await q);
}
export async function getService(db: Db, id: string) {
  return unwrap<ServiceRecord | null>(await db.from('services').select().eq('id', id).maybeSingle());
}
/** Todo serviço nasce com um contrato em rascunho. */
export async function createService(db: Db, row: Partial<ServiceRecord>) {
  const service = unwrap<ServiceRecord>(await db.from('services').insert(row).select().single());
  unwrap(await db.from('contracts').insert({ service_id: service.id }));
  return service;
}
export async function updateService(db: Db, id: string, patch: Partial<ServiceRecord>) {
  unwrap(await db.from('services').update(patch).eq('id', id));
}
export async function serviceBySubscription(db: Db, subscriptionId: string) {
  return unwrap<ServiceRecord | null>(await db.from('services').select().eq('asaas_subscription_id', subscriptionId).maybeSingle());
}

export async function listContracts(db: Db, serviceIds?: string[]) {
  if (serviceIds && !serviceIds.length) return [];
  let q = db.from('contracts').select().order('created_at');
  if (serviceIds) q = q.in('service_id', serviceIds);
  return unwrap<ContractRecord[]>(await q);
}
export type ContractWithClient = { contract: ContractRecord; service: ServiceRecord; client: ClientRecord };
/** Todos os contratos com serviço e cliente, do status mais recente para o mais antigo. */
export async function listContractsWithClient(db: Db, status?: ContractStatus): Promise<ContractWithClient[]> {
  let q = db.from('contracts').select().order('status_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const contracts = unwrap<ContractRecord[]>(await q);
  if (!contracts.length) return [];
  const services = unwrap<ServiceRecord[]>(await db.from('services').select().in('id', [...new Set(contracts.map((c) => c.service_id))]));
  const clients = unwrap<ClientRecord[]>(await db.from('clients').select().in('id', [...new Set(services.map((s) => s.client_id))]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  return contracts.flatMap((contract) => {
    const service = serviceById.get(contract.service_id);
    const client = service && clientById.get(service.client_id);
    return service && client ? [{ contract, service, client }] : [];
  });
}
export async function getContract(db: Db, id: string) {
  return unwrap<ContractRecord | null>(await db.from('contracts').select().eq('id', id).maybeSingle());
}
export async function contractByDocToken(db: Db, token: string) {
  return unwrap<ContractRecord | null>(await db.from('contracts').select().eq('zapsign_doc_token', token).maybeSingle());
}
export async function updateContract(db: Db, id: string, patch: Partial<ContractRecord>) {
  unwrap(await db.from('contracts').update({ ...patch, status_at: new Date().toISOString() }).eq('id', id));
}

export async function listCharges(db: Db, serviceIds?: string[]) {
  if (serviceIds && !serviceIds.length) return [];
  let q = db.from('charges').select().order('due_date');
  if (serviceIds) q = q.in('service_id', serviceIds);
  return unwrap<ChargeRecord[]>(await q);
}
export async function getCharge(db: Db, id: string) {
  return unwrap<ChargeRecord | null>(await db.from('charges').select().eq('id', id).maybeSingle());
}
export async function chargeByPayment(db: Db, paymentId: string) {
  return unwrap<ChargeRecord | null>(await db.from('charges').select().eq('asaas_payment_id', paymentId).maybeSingle());
}
export async function insertCharge(db: Db, row: Partial<ChargeRecord>) {
  unwrap(await db.from('charges').upsert(row, { onConflict: 'asaas_payment_id', ignoreDuplicates: true }));
}
export async function updateCharge(db: Db, id: string, patch: Partial<ChargeRecord>) {
  unwrap(await db.from('charges').update(patch).eq('id', id));
}

/** Fechar negócio numa transação só (função close_deal). Devolve o id do contrato criado. */
export async function closeDeal(db: Db, input: CloseDealInput) {
  return unwrap<string>(await db.rpc('close_deal', { input }));
}

export const OPTED_OUT_MESSAGE = 'Este contato pediu para não receber mensagens.';
export const CLIENT_NO_PHONE_MESSAGE = 'O cliente não tem celular válido. Corrija o telefone no cadastro.';

/**
 * Contato do CRM de um cliente, para mandar mensagem. Usa o contato ligado; senão acha pelo celular
 * (sem religar se já é de outro cliente) ou cria um manual e liga. Não cria nada para quem pediu para parar.
 */
export async function resolveClientContact(db: Db, client: Pick<ClientRecord, 'id' | 'legal_name' | 'contact_name' | 'phone' | 'contact_id'>): Promise<{ contactId: string } | { blocked: string }> {
  const linked = client.contact_id ? await getContact(db, client.contact_id) : null;
  const phone = linked?.phone_e164 ?? toMobileE164(client.phone);
  if (!phone) return { blocked: CLIENT_NO_PHONE_MESSAGE };
  if (linked?.status === 'nao_contatar') return { blocked: OPTED_OUT_MESSAGE };
  const blocks = unwrap<unknown[] | null>(await db.from('do_not_contact').select('id').in('phone_e164', phoneMatchCandidates(phone)).limit(1));
  if (blocks?.length) return { blocked: OPTED_OUT_MESSAGE };
  if (linked) return { contactId: linked.id };
  const existing = await findContactByPhone(db, phone);
  if (existing) {
    if (existing.status === 'nao_contatar') return { blocked: OPTED_OUT_MESSAGE };
    const owner = await clientByContact(db, existing.id);
    if (!owner) await updateClient(db, client.id, { contact_id: existing.id });
    return { contactId: existing.id };
  }
  const created = await createContact(db, { name: client.contact_name || client.legal_name, phone_e164: phone, origin: 'manual', status: 'fechado' });
  await updateClient(db, client.id, { contact_id: created.id });
  return { contactId: created.id };
}

export type ChargeWithClient = { charge: ChargeRecord; service: ServiceRecord; client: ClientRecord };

async function withClients(db: Db, charges: ChargeRecord[]): Promise<ChargeWithClient[]> {
  if (!charges.length) return [];
  const services = unwrap<ServiceRecord[]>(await db.from('services').select().in('id', [...new Set(charges.map((c) => c.service_id))]));
  const clients = unwrap<ClientRecord[]>(await db.from('clients').select().in('id', [...new Set(services.map((s) => s.client_id))]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  return charges.flatMap((charge) => {
    const service = serviceById.get(charge.service_id);
    const client = service && clientById.get(service.client_id);
    return service && client ? [{ charge, service, client }] : [];
  });
}

/** Serviços com contrato assinado e sem cobrança emitida (nem avulsa nem assinatura; cobrança cancelada não conta). Sem contrato assinado, fora. */
export async function listReadyToCharge(db: Db): Promise<ContractWithClient[]> {
  const signed = (await listContractsWithClient(db, 'assinado')).filter((r) => r.service.status === 'ativo' && !r.service.asaas_subscription_id);
  if (!signed.length) return [];
  const rows = unwrap<{ service_id: string; status: ChargeStatus }[]>(await db.from('charges').select('service_id, status').in('service_id', signed.map((r) => r.service.id)));
  const charged = new Set(rows.filter((c) => c.status !== 'cancelado').map((c) => c.service_id));
  return signed.filter((r) => !charged.has(r.service.id)).sort((a, b) => +new Date(a.contract.status_at) - +new Date(b.contract.status_at));
}

/** Cobranças pendentes e vencidas: vencidas primeiro, depois pelo vencimento. */
export async function listOpenCharges(db: Db): Promise<ChargeWithClient[]> {
  const charges = unwrap<ChargeRecord[]>(await db.from('charges').select().in('status', ['pendente', 'vencido']).order('due_date'));
  const rows = await withClients(db, charges);
  return [...rows.filter((r) => r.charge.status === 'vencido'), ...rows.filter((r) => r.charge.status !== 'vencido')];
}

/** Cobranças pagas desde `since`, as mais recentes primeiro. Sem `paid_at` (pagas antes da v2), vale a criação. */
export async function listPaidCharges(db: Db, since: Date): Promise<ChargeWithClient[]> {
  const charges = unwrap<ChargeRecord[]>(await db.from('charges').select().eq('status', 'pago'));
  const when = (c: ChargeRecord) => c.paid_at ?? c.created_at;
  const recent = charges.filter((c) => new Date(when(c)) >= since).sort((a, b) => +new Date(when(b)) - +new Date(when(a)));
  return withClients(db, recent);
}

/**
 * Efeitos de um pagamento recém-confirmado: grava `paid_at`, deixa o serviço `ativo` no primeiro pagamento
 * (cancelado fica como está) e registra "Pagamento recebido" no histórico do lead do cliente, quando há.
 */
export async function recordChargePaid(db: Db, chargeId: string, paidAt: string) {
  const charge = await getCharge(db, chargeId);
  if (!charge) return;
  await updateCharge(db, charge.id, { paid_at: paidAt });
  const service = await getService(db, charge.service_id);
  if (!service) return;
  const paid = unwrap<{ id: string }[]>(await db.from('charges').select('id').eq('service_id', service.id).eq('status', 'pago'));
  if (!paid.some((c) => c.id !== charge.id) && service.status === 'concluido') await updateService(db, service.id, { status: 'ativo' });
  const client = await getClient(db, service.client_id);
  if (client?.lead_id) await logEvent(db, client.lead_id, 'pagamento_recebido', { charge_id: charge.id, service_id: service.id, amount_cents: charge.amount_cents, paid_at: paidAt });
}

/** Registra "Contrato assinado" no histórico do lead do cliente, quando há. */
export async function recordContractSigned(db: Db, contractId: string) {
  const contract = await getContract(db, contractId);
  const service = contract && (await getService(db, contract.service_id));
  if (!contract || !service) return;
  const client = await getClient(db, service.client_id);
  if (client?.lead_id) await logEvent(db, client.lead_id, 'contrato_assinado', { contract_id: contractId, service_id: service.id });
}
