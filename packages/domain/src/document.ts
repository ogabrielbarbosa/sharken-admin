const digitsOf = (value: string) => value.replace(/\D/g, '');

/** Forma guardada de CPF/CNPJ: só números (e letras, no CNPJ alfanumérico de 2026), em maiúsculas. */
export function normalizeDocument(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function checkDigit(digits: number[], weights: number[]): number {
  const rest = digits.reduce((sum, d, i) => sum + d * weights[i], 0) % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  const d = [...digits].map(Number);
  const w = (start: number) => Array.from({ length: start - 1 }, (_, i) => start - i);
  return checkDigit(d.slice(0, 9), w(10)) === d[9] && checkDigit(d.slice(0, 10), w(11)) === d[10];
}

/** CNPJ numérico ou alfanumérico (12 caracteres + 2 dígitos verificadores). Cada caractere vale o código - 48. */
export function isValidCnpj(value: string): boolean {
  const chars = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(chars) || /^(.)\1+$/.test(chars)) return false;
  const d = [...chars].map((ch) => ch.charCodeAt(0) - 48);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return checkDigit(d.slice(0, 12), w1) === d[12] && checkDigit(d.slice(0, 13), [6, ...w1]) === d[13];
}

/** CPF ou CNPJ com pontuação. O que não tem 11 ou 14 dígitos volta como veio. */
export function formatDocument(value: string): string {
  const d = normalizeDocument(value);
  if (/^\d{11}$/.test(d)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14 && /^[0-9A-Z]{12}\d{2}$/.test(d)) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return value;
}

/** Telefone brasileiro para exibição: (19) 98134-2207. Sem reconhecer, devolve o texto original. */
export function formatPhone(value: string): string {
  let d = digitsOf(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}
