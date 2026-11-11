export function toMobileE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? `55${digits}` : null;
}

// Variantes para achar um contato: o WhatsApp às vezes entrega celular BR sem o nono dígito.
export function phoneMatchCandidates(e164: string): string[] {
  const plus = e164.startsWith('+') ? '+' : '';
  const digits = e164.replace(/\D/g, '');
  const out = [`${plus}${digits}`];
  if (/^55[1-9][0-9]9[0-9]{8}$/.test(digits)) out.push(`${plus}${digits.slice(0, 4)}${digits.slice(5)}`);
  else if (/^55[1-9][0-9][6-9][0-9]{7}$/.test(digits)) out.push(`${plus}${digits.slice(0, 4)}9${digits.slice(4)}`);
  return out;
}
