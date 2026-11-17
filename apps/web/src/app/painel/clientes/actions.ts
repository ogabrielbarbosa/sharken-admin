'use server';

import {
  createClient, createService, getCharge, getClient, getContract, getLead, getService, insertCharge,
  updateCharge, updateClient, updateContract, updateService,
} from '@lps/db';
import { normalizeDocument, parseBRLToCents, validateDocument, type ChargeMethod } from '@lps/domain';
import { createAbacateCharge, deletePayment, deleteSubscription, getContractProvider } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';
import { workspaceAbacate } from '@/lib/billing';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const withError = (href: string, message: string) => `${href}${href.includes('?') ? '&' : '?'}erro=${encodeURIComponent(message)}`;
const refresh = () => revalidatePath('/painel', 'layout');
/** Telas diferentes mandam o formulário e querem voltar para si mesmas. */
const safePath = (path: string, fallback: string) => (path.startsWith('/painel/') && !path.includes('\\') && !path.includes('//') ? path : fallback);
const backTo = (form: FormData, fallback: string) => safePath(text(form, 'back'), fallback);

function clientFields(form: FormData) {
  return {
    legal_name: text(form, 'legal_name'),
    document: normalizeDocument(text(form, 'document')),
    contact_name: text(form, 'contact_name') || null,
    email: text(form, 'email') || null,
    phone: text(form, 'phone') || null,
    address: text(form, 'address') || null,
  };
}

export async function saveClientAction(form: FormData) {
  const db = await authedDb();
  const back = text(form, 'closeHref');
  const fields = clientFields(form);
  const reopen = text(form, 'reopenHref') || back;
  if (!fields.legal_name) redirect(withError(reopen, 'Informe o nome ou a razão social.'));
  if (!validateDocument(fields.document)) redirect(withError(reopen, 'CPF ou CNPJ inválido.'));

  const clientId = text(form, 'clientId');
  if (clientId) {
    await updateClient(db, clientId, fields);
    refresh();
    redirect(`/painel/clientes/${clientId}`);
  }
  const leadId = text(form, 'leadId') || null;
  const lead = leadId ? await getLead(db, leadId) : null;
  const client = await createClient(db, { ...fields, lead_id: leadId, location: lead?.city ?? (text(form, 'location') || null) });
  refresh();
  redirect(`/painel/clientes/${client.id}?servico=1`);
}

export async function createClientFromLeadAction(form: FormData) {
  form.set('reopenHref', `${text(form, 'closeHref')}?cadastrar=${text(form, 'leadId')}`);
  return saveClientAction(form);
}

export async function createNewClientAction(form: FormData) {
  form.set('reopenHref', '/painel/clientes?novo=1');
  return saveClientAction(form);
}

export async function createServiceAction(form: FormData) {
  const db = await authedDb();
  const clientId = text(form, 'clientId');
  const back = `/painel/clientes/${clientId}`;
  const amount = parseBRLToCents(text(form, 'amount'));
  if (!text(form, 'name') || amount === null || !text(form, 'start_date')) redirect(withError(`${back}?servico=1`, 'Preencha nome, valor e data de início.'));
  await createService(db, {
    client_id: clientId,
    name: text(form, 'name'),
    kind: text(form, 'kind') === 'recorrente' ? 'recorrente' : 'unico',
    amount_cents: amount,
    start_date: text(form, 'start_date'),
    notes: text(form, 'notes') || null,
    cycle: text(form, 'kind') === 'recorrente' ? (text(form, 'cycle') || 'mensal') : null,
  });
  refresh();
  redirect(back);
}

export async function setServiceStatusAction(form: FormData) {
  const db = await authedDb();
  const service = await getService(db, text(form, 'serviceId'));
  if (!service) return;
  const status = text(form, 'status') as 'concluido' | 'cancelado';
  const back = `/painel/clientes/${service.client_id}`;
  if (status === 'cancelado') {
    try {
      // Assinatura antiga do Asaas e a da AbacatePay: param de cobrar junto com o serviço.
      if (service.asaas_subscription_id) await deleteSubscription(service.asaas_subscription_id);
      if (service.abacate_subscription_id) await (await workspaceAbacate(db)).cancelSubscription(service.abacate_subscription_id);
    } catch (err) {
      redirect(withError(back, (err as Error).message));
    }
  }
  await updateService(db, service.id, { status, ...(status === 'cancelado' ? { asaas_subscription_id: null, abacate_subscription_id: null } : {}) });
  refresh();
}

export async function sendContractAction(form: FormData) {
  const db = await authedDb();
  const contract = await getContract(db, text(form, 'contractId'));
  const service = contract && (await getService(db, contract.service_id));
  const client = service && (await getClient(db, service.client_id));
  if (!contract || !service || !client) return;
  const back = backTo(form, `/painel/clientes/${client.id}`);
  try {
    const { docToken, signUrl } = await getContractProvider().send(client, service, contract.id);
    await updateContract(db, contract.id, { status: 'enviado', zapsign_doc_token: docToken, sign_url: signUrl, sent_at: new Date().toISOString() });
  } catch (err) {
    redirect(withError(back, (err as Error).message));
  }
  refresh();
}

export async function openContractAction(form: FormData) {
  const db = await authedDb();
  const contract = await getContract(db, text(form, 'contractId'));
  if (!contract?.zapsign_doc_token) return;
  let url: string | null = null;
  try {
    url = await getContractProvider().fileUrl(contract.zapsign_doc_token);
  } catch (err) {
    const service = await getService(db, contract.service_id);
    redirect(withError(backTo(form, `/painel/clientes/${service?.client_id}`), (err as Error).message));
  }
  if (url) redirect(url);
}

export async function createChargeAction(form: FormData) {
  const db = await authedDb();
  const clientId = text(form, 'clientId');
  const page = `/painel/clientes/${clientId}`;
  const back = backTo(form, page);
  const again = safePath(text(form, 'reopen'), `${page}?cobranca=1`);
  const client = await getClient(db, clientId);
  const service = await getService(db, text(form, 'serviceId'));
  const amount = parseBRLToCents(text(form, 'amount'));
  if (!client || !service || amount === null || !text(form, 'description') || !text(form, 'due_date')) {
    redirect(withError(again, 'Preencha serviço, descrição, valor e vencimento.'));
  }
  const charge = {
    id: crypto.randomUUID(),
    description: text(form, 'description'),
    amount_cents: amount,
    due_date: text(form, 'due_date'),
    method: text(form, 'method') as ChargeMethod,
  };
  try {
    if (service.kind === 'recorrente' && (service.asaas_subscription_id || service.abacate_subscription_id)) throw new Error('Este serviço já tem uma cobrança recorrente ativa.');
    const api = await workspaceAbacate(db);
    const checkout = await createAbacateCharge(api, { client, service: { ...service, cycle: text(form, 'cycle') || service.cycle }, charge });
    if (service.kind === 'recorrente') await updateService(db, service.id, { abacate_checkout_id: checkout.id });
    await insertCharge(db, { ...charge, service_id: service.id, status: 'pendente', payment_url: checkout.url, abacate_checkout_id: checkout.id });
  } catch (err) {
    redirect(withError(again, (err as Error).message));
  }
  refresh();
  redirect(back);
}

export async function cancelChargeAction(form: FormData) {
  const db = await authedDb();
  const charge = await getCharge(db, text(form, 'chargeId'));
  if (!charge) return;
  const service = await getService(db, charge.service_id);
  try {
    // Asaas apaga a cobrança. Na AbacatePay só o link de assinatura ainda não paga sai do ar; o link avulso
    // continua aceitando pagamento, e se o cliente pagar mesmo assim o aviso traz a cobrança de volta como paga.
    if (charge.asaas_payment_id) await deletePayment(charge.asaas_payment_id);
    if (charge.abacate_checkout_id && service?.abacate_checkout_id === charge.abacate_checkout_id && !service.abacate_subscription_id && !charge.abacate_payment_id) {
      await (await workspaceAbacate(db)).deleteSubscriptionCheckout(charge.abacate_checkout_id);
      await updateService(db, service.id, { abacate_checkout_id: null });
    }
    await updateCharge(db, charge.id, { status: 'cancelado' });
  } catch (err) {
    redirect(withError(`/painel/clientes/${service?.client_id}`, (err as Error).message));
  }
  refresh();
}

