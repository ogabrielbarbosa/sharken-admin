import type { Lead } from './types';

const digitsOf = (value: string) => value.replace(/\D/g, '');

function checkDigit(digits: number[], weights: number[]): number {
  const rest = digits.reduce((sum, d, i) => sum + d * weights[i], 0) % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function validCpf(d: number[]): boolean {
  const w = (start: number) => Array.from({ length: start - 1 }, (_, i) => start - i);
  return checkDigit(d.slice(0, 9), w(10)) === d[9] && checkDigit(d.slice(0, 10), w(11)) === d[10];
}

function validCnpj(d: number[]): boolean {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return checkDigit(d.slice(0, 12), w1) === d[12] && checkDigit(d.slice(0, 13), [6, ...w1]) === d[13];
}

export function validateDocument(document: string): boolean {
  const digits = digitsOf(document);
  if (/^(\d)\1+$/.test(digits)) return false;
  const list = [...digits].map(Number);
  if (digits.length === 11) return validCpf(list);
  if (digits.length === 14) return validCnpj(list);
  return false;
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
