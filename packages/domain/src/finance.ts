export type ChargeStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado';
export type ChargeMethod = 'pix' | 'boleto' | 'cartao';
export type ContractStatus = 'rascunho' | 'enviado' | 'assinado' | 'recusado';

type ChargeAmount = { amount_cents: number; status: ChargeStatus };

export function summarizeCharges(charges: readonly ChargeAmount[]) {
  const sum = (f: (c: ChargeAmount) => boolean) => charges.filter(f).reduce((total, c) => total + c.amount_cents, 0);
  const invoiced = sum((c) => c.status !== 'cancelado');
  const received = sum((c) => c.status === 'pago');
  return { invoiced, received, open: invoiced - received, overdue: sum((c) => c.status === 'vencido') };
}

export function clientStanding(charges: readonly ChargeAmount[]): 'em_dia' | 'em_atraso' {
  return charges.some((c) => c.status === 'vencido') ? 'em_atraso' : 'em_dia';
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function parseBRLToCents(input: string): number | null {
  let clean = input.replace(/[^\d.,]/g, '');
  if (!clean) return null;
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(clean)) clean = clean.replace(/\./g, '');
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}
