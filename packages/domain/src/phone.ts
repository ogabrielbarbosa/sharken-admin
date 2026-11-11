export function toMobileE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? `55${digits}` : null;
}

// Formato canônico: dígitos com o código do país, sem "+" (como os leads e a lista de bloqueio guardam).
// Variantes para achar um contato: com e sem o "+", e com e sem o nono dígito (o WhatsApp às vezes entrega o celular BR sem ele).
export function phoneMatchCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  const variants = [digits];
  if (/^55[1-9][0-9]9[0-9]{8}$/.test(digits)) variants.push(`${digits.slice(0, 4)}${digits.slice(5)}`);
  else if (/^55[1-9][0-9][6-9][0-9]{7}$/.test(digits)) variants.push(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  return variants.flatMap((v) => [v, `+${v}`]);
}
