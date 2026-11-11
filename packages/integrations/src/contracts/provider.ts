import type { ChargeMethod } from '@lps/domain';
import { zapsignProvider } from './zapsign';

export type ContractClient = {
  legal_name: string;
  document: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
};
export type ContractService = {
  name: string;
  kind?: 'unico' | 'recorrente';
  amount_cents: number;
  start_date: string;
  notes?: string | null;
  payment_method?: ChargeMethod | null;
  first_due_date?: string | null;
  cycle?: string | null;
};
export type ContractWebhookEvent = { docToken: string; status: 'assinado' | 'recusado' | 'enviado' };

/** O que o resto do sistema precisa de um provedor de assinatura. Trocar de provedor é trocar `getContractProvider`. */
export interface ContractProvider {
  send(client: ContractClient, service: ContractService, contractId: string): Promise<{ docToken: string; signUrl: string }>;
  fileUrl(docToken: string): Promise<string | null>;
  normalizeWebhook(body: unknown): ContractWebhookEvent | null;
}

export function getContractProvider(): ContractProvider {
  return zapsignProvider;
}
