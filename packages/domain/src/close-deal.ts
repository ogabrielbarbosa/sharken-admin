import { isValidCnpj, isValidCpf } from './document';
import type { Contact } from './contacts';
import type { ChargeMethod } from './finance';
import type { Lead } from './types';

export type Cycle = 'mensal' | 'trimestral' | 'semestral' | 'anual';
export const CYCLES: { value: Cycle; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];
export const PAYMENT_METHODS: { value: ChargeMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
];

export type CloseDealInput = {
  contact_id: string;
  client: { legal_name: string; document: string; contact_name: string; email: string; phone: string; address: string; location: string };
  service: { name: string; kind: 'unico' | 'recorrente'; amount_cents: number | null; start_date: string; notes: string };
  payment: { method: ChargeMethod; first_due_date: string; cycle: Cycle | null };
};

/** Cliente e serviço sugeridos a partir do contato e do lead. O que o sistema não sabe fica em branco. */
export function closeDealDefaults(contact: Contact, lead: Lead | null): CloseDealInput {
  const name = contact.name.trim();
  const businessName = lead?.name.trim() || name;
  return {
    contact_id: contact.id,
    client: {
      legal_name: businessName,
      document: '',
      // Contato de batch leva o nome do negócio; o nome de quem assina só vem do perfil do WhatsApp.
      contact_name: lead && name === businessName ? '' : name,
      email: '',
      phone: contact.phone_e164.replace(/\D/g, ''),
      address: lead?.address ?? '',
      location: lead?.city ?? '',
    },
    service: { name: `Site para ${businessName}`, kind: 'unico', amount_cents: null, start_date: '', notes: '' },
    payment: { method: 'pix', first_due_date: '', cycle: null },
  };
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Erros por campo. Vazio quando pode salvar. */
export function validateCloseDeal(input: CloseDealInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const { client, service, payment } = input;
  if (!client.legal_name.trim()) errors.legal_name = 'Informe o nome ou a razão social.';
  if (!isValidCpf(client.document) && !isValidCnpj(client.document)) errors.document = 'CPF ou CNPJ inválido.';
  if (client.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email.trim())) errors.email = 'E-mail inválido.';
  if (!service.name.trim()) errors.service_name = 'Informe o nome do serviço.';
  if (service.amount_cents === null || !Number.isInteger(service.amount_cents) || service.amount_cents <= 0) errors.amount = 'Informe um valor maior que zero.';
  if (!isoDate.test(service.start_date)) errors.start_date = 'Informe a data de início.';
  if (!isoDate.test(payment.first_due_date)) errors.first_due_date = 'Informe o primeiro vencimento.';
  if (!PAYMENT_METHODS.some((m) => m.value === payment.method)) errors.method = 'Escolha a forma de pagamento.';
  if (service.kind === 'recorrente' && !CYCLES.some((c) => c.value === payment.cycle)) errors.cycle = 'Escolha a periodicidade.';
  return errors;
}
