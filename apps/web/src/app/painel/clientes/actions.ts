'use server';

import {
  createClient, createService, getCharge, getClient, getContract, getLead, getService, insertCharge,
  updateCharge, updateClient, updateContract, updateService,
} from '@lps/db';
import { parseBRLToCents, validateDocument, type ChargeMethod } from '@lps/domain';
import { createCustomer, createPayment, createSubscription, deletePayment, deleteSubscription, getContractFileUrl, sendContract, type AsaasCycle } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedDb } from '@/lib/auth';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const withError = (href: string, message: string) => `${href}${href.includes('?') ? '&' : '?'}erro=${encodeURIComponent(message)}`;
const refresh = () => revalidatePath('/painel', 'layout');

function clientFields(form: FormData) {
  return {
    legal_name: text(form, 'legal_name'),
    document: text(form, 'document'),
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
  if (status === 'cancelado' && service.asaas_subscription_id) {
    try {
      await deleteSubscription(service.asaas_subscription_id);
    } catch (err) {
      redirect(withError(back, (err as Error).message));
    }
  }
  await updateService(db, service.id, { status, ...(status === 'cancelado' ? { asaas_subscription_id: null } : {}) });
  refresh();
}

export async function sendContractAction(form: FormData) {
  const db = await authedDb();
  const contract = await getContract(db, text(form, 'contractId'));
  const service = contract && (await getService(db, contract.service_id));
  const client = service && (await getClient(db, service.client_id));
  if (!contract || !service || !client) return;
  const back = `/painel/clientes/${client.id}`;
  try {
    const { docToken, signUrl } = await sendContract(client, service, contract.id);
    await updateContract(db, contract.id, { status: 'enviado', zapsign_doc_token: docToken, sign_url: signUrl });
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
    url = await getContractFileUrl(contract.zapsign_doc_token);
  } catch (err) {
    const service = await getService(db, contract.service_id);
    redirect(withError(`/painel/clientes/${service?.client_id}`, (err as Error).message));
  }
  if (url) redirect(url);
}

export async function createChargeAction(form: FormData) {
  const db = await authedDb();
  const clientId = text(form, 'clientId');
  const back = `/painel/clientes/${clientId}`;
  const again = `${back}?cobranca=1`;
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
    let customerId = client.asaas_customer_id;
    if (!customerId) {
      customerId = (await createCustomer(client)).id;
      await updateClient(db, client.id, { asaas_customer_id: customerId });
    }
    if (service.kind === 'recorrente') {
      if (service.asaas_subscription_id) throw new Error('Este serviço já tem uma cobrança recorrente ativa.');
      const subscription = await createSubscription(charge, customerId, (text(form, 'cycle') || 'MONTHLY') as AsaasCycle);
      await updateService(db, service.id, { asaas_subscription_id: subscription.id });
    } else {
      const payment = await createPayment(charge, customerId);
      await insertCharge(db, { ...charge, service_id: service.id, status: 'pendente', payment_url: payment.invoiceUrl, asaas_payment_id: payment.id });
    }
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
    if (charge.asaas_payment_id) await deletePayment(charge.asaas_payment_id);
    await updateCharge(db, charge.id, { status: 'cancelado' });
  } catch (err) {
    redirect(withError(`/painel/clientes/${service?.client_id}`, (err as Error).message));
  }
  refresh();
}

