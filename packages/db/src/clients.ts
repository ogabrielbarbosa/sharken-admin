import type { ChargeMethod, ChargeStatus, ContractStatus } from '@lps/domain';
import type { Db } from './client';

export type ClientRecord = { id: string; created_at: string; lead_id: string | null; legal_name: string; document: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; location: string | null; asaas_customer_id: string | null };
export type ServiceRecord = { id: string; client_id: string; name: string; kind: 'unico' | 'recorrente'; amount_cents: number; start_date: string; notes: string | null; status: 'ativo' | 'concluido' | 'cancelado'; asaas_subscription_id: string | null };
export type ContractRecord = { id: string; service_id: string; status: ContractStatus; zapsign_doc_token: string | null; sign_url: string | null; status_at: string };
export type ChargeRecord = { id: string; created_at: string; service_id: string; description: string; amount_cents: number; due_date: string; method: ChargeMethod; status: ChargeStatus; payment_url: string | null; asaas_payment_id: string | null };

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
