import { requireOptional } from '@lps/config';
import { formatBRL, formatDocument, formatPhone, type ChargeMethod } from '@lps/domain';
import type { ContractClient, ContractProvider, ContractService, ContractWebhookEvent } from './provider';

const toBrDate = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '');
const METHOD_LABEL: Record<ChargeMethod, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão' };
const CYCLE_LABEL: Record<string, string> = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };

/** Data por extenso em pt-BR, no fuso de São Paulo: "11 de novembro de 2026". */
export function longDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date);
}

export function requireTemplateId(source: Record<string, string | undefined> = process.env): string {
  const id = source.ZAPSIGN_TEMPLATE_ID;
  if (!id) throw new Error('Falta o modelo de contrato. Crie o modelo no ZapSign e preencha ZAPSIGN_TEMPLATE_ID.');
  return id;
}

/** As 14 variáveis do modelo (spec de Contrato, seção 5). As que o modelo não usa, o ZapSign ignora. */
export function buildContractPayload(client: ContractClient, service: ContractService, templateId: string, contractId: string, now: Date = new Date()) {
  const recurring = service.kind === 'recorrente';
  const data: Record<string, string> = {
    '{{NOME}}': client.legal_name,
    '{{DOCUMENTO}}': formatDocument(client.document),
    '{{RESPONSAVEL}}': client.contact_name?.trim() || client.legal_name,
    '{{EMAIL}}': client.email ?? '',
    '{{TELEFONE}}': client.phone ? formatPhone(client.phone) : '',
    '{{ENDERECO}}': client.address ?? '',
    '{{SERVICO}}': service.name,
    '{{DESCRICAO}}': service.notes ?? '',
    '{{VALOR}}': formatBRL(service.amount_cents),
    '{{FORMA_PAGAMENTO}}': service.payment_method ? METHOD_LABEL[service.payment_method] : '',
    '{{VENCIMENTO}}': toBrDate(service.first_due_date),
    '{{PERIODICIDADE}}': recurring && service.cycle ? (CYCLE_LABEL[service.cycle] ?? service.cycle) : 'pagamento único',
    '{{DATA_INICIO}}': toBrDate(service.start_date),
    '{{DATA}}': longDate(now),
  };
  return {
    template_id: templateId,
    signer_name: client.contact_name?.trim() || client.legal_name,
    signer_email: client.email ?? undefined,
    disable_signer_emails: true,
    send_automatic_email: false,
    external_id: contractId,
    lang: 'pt-br',
    data: Object.entries(data).map(([de, para]) => ({ de, para })),
  };
}

export async function sendContract(client: ContractClient, service: ContractService, contractId: string): Promise<{ docToken: string; signUrl: string }> {
  const res = await fetch(`${requireOptional('ZAPSIGN_BASE_URL')}/models/create-doc/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requireOptional('ZAPSIGN_API_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify(buildContractPayload(client, service, requireTemplateId(), contractId)),
  });
  if (!res.ok) throw new Error(`O ZapSign respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { token: string; signers: { sign_url: string }[] };
  return { docToken: json.token, signUrl: json.signers[0].sign_url };
}

/** Os links de arquivo do ZapSign expiram, então cada abertura pede um link novo. */
export async function getContractFileUrl(docToken: string): Promise<string | null> {
  const res = await fetch(`${requireOptional('ZAPSIGN_BASE_URL')}/docs/${docToken}/`, {
    headers: { Authorization: `Bearer ${requireOptional('ZAPSIGN_API_TOKEN')}` },
  });
  if (!res.ok) throw new Error(`O ZapSign respondeu ${res.status}.`);
  const json = (await res.json()) as { signed_file: string | null; original_file: string | null };
  return json.signed_file ?? json.original_file;
}

export function normalizeWebhook(body: unknown): ContractWebhookEvent | null {
  const b = (body ?? {}) as { token?: unknown; event_type?: unknown; status?: unknown };
  if (typeof b.token !== 'string' || !b.token) return null;
  const status = b.event_type === 'doc_signed' && b.status === 'signed' ? 'assinado' : b.event_type === 'doc_refused' ? 'recusado' : 'enviado';
  return { docToken: b.token, status };
}

export const zapsignProvider: ContractProvider = { send: sendContract, fileUrl: getContractFileUrl, normalizeWebhook };
