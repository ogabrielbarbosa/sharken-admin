export type AsaasCycleCode = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';

const CYCLE_TO_ASAAS: Record<string, AsaasCycleCode> = { mensal: 'MONTHLY', trimestral: 'QUARTERLY', semestral: 'SEMIANNUALLY', anual: 'YEARLY' };

/** Periodicidade gravada no serviço (português) para o código do Asaas. Sem valor conhecido, mensal. */
export const toAsaasCycle = (cycle: string | null | undefined): AsaasCycleCode => CYCLE_TO_ASAAS[cycle ?? ''] ?? 'MONTHLY';

/** '2026-11-20' → '20/11/2026'. Sem passar por Date, para não deslocar o dia pelo fuso. */
export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Dias de `from` até `to` (ambos 'YYYY-MM-DD'); negativo quando `to` já passou. */
export function daysUntil(to: string, from: string): number {
  const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Data do pagamento informada pelo Asaas (paymentDate ou confirmedDate); sem ela, o momento do aviso. */
export function paidAtOf(payment: { paymentDate?: string | null; confirmedDate?: string | null }, now: Date = new Date()): string {
  const raw = payment.paymentDate || payment.confirmedDate;
  const date = raw ? new Date(raw.length === 10 ? `${raw}T12:00:00-03:00` : raw) : null;
  return (date && !Number.isNaN(date.getTime()) ? date : now).toISOString();
}

/** Texto do WhatsApp com a cobrança. Troca os marcadores [descrição], [valor], [data] e [link]. */
export function fillPaymentMessage(template: string, v: { description: string; value: string; dueDate: string; link: string }): string {
  return template.replace('[descrição]', () => v.description).replace('[valor]', () => v.value).replace('[data]', () => formatDueDate(v.dueDate)).replace('[link]', () => v.link);
}
