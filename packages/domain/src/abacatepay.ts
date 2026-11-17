import type { Cycle } from './close-deal';
import type { ChargeMethod, ChargeStatus } from './finance';

export type AbacateMethod = 'PIX' | 'CARD' | 'BOLETO';
export type AbacateCycle = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'ANNUALLY';

const TO_METHOD: Record<ChargeMethod, AbacateMethod> = { pix: 'PIX', cartao: 'CARD', boleto: 'BOLETO' };
const FROM_METHOD: Record<string, ChargeMethod> = { PIX: 'pix', CARD: 'cartao', BOLETO: 'boleto' };
const TO_CYCLE: Record<Cycle, AbacateCycle> = { mensal: 'MONTHLY', trimestral: 'QUARTERLY', semestral: 'SEMIANNUALLY', anual: 'ANNUALLY' };

export const toAbacateMethod = (method: ChargeMethod): AbacateMethod => TO_METHOD[method];
export const fromAbacateMethod = (method: string | null | undefined, fallback: ChargeMethod = 'pix'): ChargeMethod => FROM_METHOD[method ?? ''] ?? fallback;
/** Periodicidade do serviço (português) para o ciclo da AbacatePay. Sem valor conhecido, mensal. */
export const toAbacateCycle = (cycle: string | null | undefined): AbacateCycle => TO_CYCLE[cycle as Cycle] ?? 'MONTHLY';

/** Chave de teste (`abc_dev_`) ou de produção (`abc_prod_`). Outro formato não é chave da AbacatePay v2. */
export function abacateKeyMode(key: string): 'teste' | 'producao' | null {
  if (/^abc_dev_\S+$/.test(key)) return 'teste';
  if (/^abc_prod_\S+$/.test(key)) return 'producao';
  return null;
}

/** Como a chave aparece na tela: o começo e os 4 últimos caracteres. */
export const maskApiKey = (key: string) => (key.length > 16 ? `${key.slice(0, 9)}…${key.slice(-4)}` : '••••');

/** Eventos que o webhook de cada workspace assina. */
export const ABACATE_WEBHOOK_EVENTS = [
  'checkout.completed', 'checkout.refunded', 'checkout.lost',
  'subscription.completed', 'subscription.renewed', 'subscription.payment_failed', 'subscription.cancelled',
] as const;

type AbacateCheckout = { id: string; externalId?: string | null; url?: string | null; amount?: number; paidAmount?: number | null; frequency?: string; status?: string; updatedAt?: string | null };
type AbacatePayment = { id: string; amount?: number; paidAmount?: number | null; status?: string; createdAt?: string | null; updatedAt?: string | null };

/** O envelope de cada entrega. Os campos que o sistema não usa ficam de fora de propósito (a AbacatePay acrescenta campos). */
export type AbacateEvent = {
  id?: string;
  event: string;
  devMode?: boolean;
  data: {
    checkout?: AbacateCheckout;
    subscription?: { id: string; status?: string; method?: string; amount?: number; cancelledDueTo?: string | null };
    payment?: AbacatePayment;
    payerInformation?: { method?: string } | null;
    installmentId?: string;
  };
};

/** Data do pagamento informada pela AbacatePay; sem ela, o momento do aviso. */
export function abacatePaidAt(evt: AbacateEvent, now: Date = new Date()): string {
  const raw = evt.data.payment?.updatedAt ?? evt.data.checkout?.updatedAt;
  const date = raw ? new Date(raw) : null;
  return (date && !Number.isNaN(date.getTime()) ? date : now).toISOString();
}

/** Uma cobrança paga: avulsa (pelo checkout) ou de assinatura (pelo pagamento do ciclo). */
export type AbacatePlan =
  | { action: 'ignore' }
  /** Pagamento de checkout avulso: a cobrança do checkout passa a paga. */
  | { action: 'checkout_paid'; checkoutId: string; method: ChargeMethod | null }
  /** Reembolso ou disputa perdida: a cobrança do checkout é cancelada. */
  | { action: 'checkout_reversed'; checkoutId: string }
  /** Pagamento de assinatura (primeiro ou renovação). */
  | { action: 'subscription_paid'; checkoutId: string; subscriptionId: string; paymentId: string; amountCents: number; method: ChargeMethod | null }
  /** Tentativa de cobrança da assinatura que falhou: a cobrança do ciclo fica vencida. */
  | { action: 'subscription_failed'; checkoutId: string; subscriptionId: string; installmentId: string; amountCents: number; method: ChargeMethod | null }
  | { action: 'subscription_cancelled'; checkoutId: string | null; subscriptionId: string };

/**
 * O que o evento muda. O pagamento de assinatura também chega como `checkout.completed` com
 * `frequency: SUBSCRIPTION`; esse é ignorado, para valer só o `subscription.*` e não contar duas vezes.
 */
export function planAbacateEvent(evt: AbacateEvent): AbacatePlan {
  const { checkout, subscription, payment, payerInformation } = evt.data ?? {};
  const method = payerInformation?.method ? fromAbacateMethod(payerInformation.method) : null;
  switch (evt.event) {
    case 'checkout.completed':
      if (!checkout?.id || checkout.frequency === 'SUBSCRIPTION') return { action: 'ignore' };
      return { action: 'checkout_paid', checkoutId: checkout.id, method };
    case 'checkout.refunded':
    case 'checkout.lost':
      return checkout?.id ? { action: 'checkout_reversed', checkoutId: checkout.id } : { action: 'ignore' };
    case 'subscription.completed':
    case 'subscription.renewed':
      if (!checkout?.id || !subscription?.id || !payment?.id) return { action: 'ignore' };
      return {
        action: 'subscription_paid', checkoutId: checkout.id, subscriptionId: subscription.id, paymentId: payment.id,
        amountCents: payment.paidAmount || payment.amount || subscription.amount || 0,
        method: method ?? (subscription.method ? fromAbacateMethod(subscription.method) : null),
      };
    case 'subscription.payment_failed':
      if (!checkout?.id || !subscription?.id) return { action: 'ignore' };
      return {
        action: 'subscription_failed', checkoutId: checkout.id, subscriptionId: subscription.id,
        installmentId: evt.data.installmentId ?? payment?.id ?? `${subscription.id}-falha`,
        amountCents: payment?.amount || subscription.amount || 0,
        method: subscription.method ? fromAbacateMethod(subscription.method) : null,
      };
    case 'subscription.cancelled':
      return subscription?.id ? { action: 'subscription_cancelled', checkoutId: checkout?.id ?? null, subscriptionId: subscription.id } : { action: 'ignore' };
    default:
      return { action: 'ignore' };
  }
}

/**
 * Status novo de uma cobrança avulsa. Pago vale mesmo sobre cancelada: o link segue aceitando pagamento
 * na AbacatePay, e o dinheiro que entrou é o que conta. Paga só volta atrás por reembolso.
 */
export function nextAbacateChargeStatus(current: ChargeStatus, plan: AbacatePlan): ChargeStatus {
  if (plan.action === 'checkout_paid') return 'pago';
  if (plan.action === 'checkout_reversed') return 'cancelado';
  return current;
}

/** Hoje em São Paulo, 'YYYY-MM-DD'. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
