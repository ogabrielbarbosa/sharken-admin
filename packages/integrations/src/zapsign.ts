import { requireOptional } from '@lps/config';
import { formatBRL } from '@lps/domain';

type ClientFields = { legal_name: string; document: string; contact_name: string | null; email: string | null; phone: string | null };
type ServiceFields = { name: string; amount_cents: number; start_date: string };

const toBrDate = (iso: string) => iso.split('-').reverse().join('/');

export function requireTemplateId(source: Record<string, string | undefined> = process.env): string {
  const id = source.ZAPSIGN_TEMPLATE_ID;
  if (!id) throw new Error('Falta o modelo de contrato. Crie o modelo no ZapSign e preencha ZAPSIGN_TEMPLATE_ID.');
  return id;
}

export function buildContractPayload(client: ClientFields, service: ServiceFields, templateId: string, contractId: string) {
  const data: Record<string, string> = {
    '{{NOME}}': client.legal_name,
    '{{DOCUMENTO}}': client.document,
    '{{SERVICO}}': service.name,
    '{{VALOR}}': formatBRL(service.amount_cents),
    '{{DATA_INICIO}}': toBrDate(service.start_date),
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

export async function sendContract(client: ClientFields, service: ServiceFields, contractId: string): Promise<{ docToken: string; signUrl: string }> {
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
