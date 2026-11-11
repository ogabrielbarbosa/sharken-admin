import { isValidCnpj, isValidCpf } from './document';
import type { Lead } from './types';

export function validateDocument(document: string): boolean {
  return isValidCpf(document) || isValidCnpj(document);
}

export type ClientDraft = {
  lead_id: string | null;
  legal_name: string;
  document: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  location: string;
};

export function clientDraftFromLead(lead: Lead): ClientDraft {
  return {
    lead_id: lead.id,
    legal_name: lead.name,
    document: '',
    contact_name: '',
    email: '',
    phone: lead.phone_raw ?? '',
    address: lead.address ?? '',
    location: lead.city ?? '',
  };
}
