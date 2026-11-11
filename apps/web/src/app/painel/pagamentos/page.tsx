import { listCharges, listOpenCharges, listPaidCharges, listReadyToCharge, type ChargeWithClient, type ServiceRecord } from '@lps/db';
import { CYCLES, daysUntil, formatBRL, formatDueDate, summarizeCharges, toAsaasCycle, type ChargeMethod } from '@lps/domain';
import { Info, MessageCircle, Receipt } from 'lucide-react';
import Link from 'next/link';
import { ChargeDrawer } from '@/components/clients/charge-drawer';
import { Topbar } from '@/components/layout/topbar';
import { Button, Card, ErrorNote, LinkButton, Status, Table } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { authedDb } from '@/lib/auth';
import { formatDate } from '@/lib/lead-labels';
import { whatsappPaymentAction } from './actions';

const METHOD: Record<ChargeMethod, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão' };
const BACK = '/painel/pagamentos';
const PAID_WINDOW_DAYS = 30;
const todayInSaoPaulo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const kindLabel = (s: ServiceRecord) => (s.kind === 'unico' ? 'único' : (CYCLES.find((c) => c.value === s.cycle)?.label ?? 'Mensal').toLowerCase());

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) => (
  <div className="rounded-card border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : ''}`}>{formatBRL(value)}</p>
  </div>
);

const SectionTitle = ({ title, count, hint }: { title: string; count: number; hint?: string }) => (
  <div className="mb-3 mt-8 flex items-center gap-2">
    <h2 className="text-sm font-semibold">{title}</h2>
    <span className="rounded-full bg-secondary px-2 text-xs">{count}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

const Who = ({ row }: { row: Pick<ChargeWithClient, 'client' | 'service'> }) => (
  <td className="px-4 py-3">
    <Link href={`/painel/clientes/${row.client.id}`} className="font-medium hover:underline">{row.client.legal_name}</Link>
    <p className="text-xs text-muted-foreground">{row.service.name} · {kindLabel(row.service)}</p>
  </td>
);
const Money = ({ cents }: { cents: number }) => <td className="px-4 py-3 font-mono text-xs">{formatBRL(cents)}</td>;

export default async function PagamentosPage({ searchParams }: { searchParams: Promise<{ cobrar?: string; erro?: string }> }) {
  const { cobrar, erro } = await searchParams;
  const db = await authedDb();
  const since = new Date(Date.now() - PAID_WINDOW_DAYS * 86_400_000);
  const [ready, open, paid, all] = await Promise.all([listReadyToCharge(db), listOpenCharges(db), listPaidCharges(db, since), listCharges(db)]);
  const summary = summarizeCharges(all);
  const today = todayInSaoPaulo();
  const target = cobrar ? ready.find((r) => r.service.id === cobrar) : undefined;

  return (
    <>
      <Topbar crumbs={[{ label: 'Pagamentos' }]} />
      <main className="p-4 lg:p-6">
        {erro && !target && <div className="mb-4"><ErrorNote>{erro}</ErrorNote></div>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Faturado" value={summary.invoiced} />
          <Stat label="Recebido" value={summary.received} tone="success" />
          <Stat label="Em aberto" value={summary.open} />
          <Stat label="Em atraso" value={summary.overdue} tone="danger" />
        </div>

        <SectionTitle title="Pronto para cobrar" count={ready.length} hint="contrato assinado, sem cobrança" />
        {ready.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-sm text-muted-foreground">Nada esperando cobrança. Os serviços aparecem aqui quando o contrato é assinado.</p>
        ) : (
          <Card>
            <Table head={['Cliente', 'Valor', 'Combinado', '']}>
              {ready.map((row) => {
                const { service } = row;
                return (
                  <tr key={service.id} className="hover:bg-accent/40">
                    <Who row={row} />
                    <Money cents={service.amount_cents} />
                    <td className="px-4 py-3">
                      <p>{service.payment_method ? METHOD[service.payment_method] : 'Pix'}{service.first_due_date ? ` · vence ${formatDueDate(service.first_due_date).slice(0, 5)}` : ''}</p>
                      <p className="text-xs text-muted-foreground">combinado no contrato</p>
                    </td>
                    <td className="px-4 py-3"><div className="flex justify-end"><LinkButton href={`${BACK}?cobrar=${service.id}`} variant="outline"><Receipt />Gerar cobrança</LinkButton></div></td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}

        <SectionTitle title="Em aberto" count={open.length} />
        {open.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-sm text-muted-foreground">Nenhuma cobrança em aberto.</p>
        ) : (
          <Card>
            <Table head={['Cliente', 'Valor', 'Vencimento', 'Status', '']}>
              {open.map((row) => {
                const { charge } = row;
                const late = charge.status === 'vencido';
                const days = daysUntil(charge.due_date, today);
                return (
                  <tr key={charge.id} className="hover:bg-accent/40">
                    <Who row={row} />
                    <Money cents={charge.amount_cents} />
                    <td className="px-4 py-3">
                      <p className={late ? 'text-destructive' : undefined}>{METHOD[charge.method]} · {late ? 'venceu' : 'vence'} {formatDueDate(charge.due_date).slice(0, 5)}</p>
                      <p className="text-xs text-muted-foreground">{days < 0 ? `${plural(-days, 'dia', 'dias')} em atraso` : days === 0 ? 'vence hoje' : `em ${plural(days, 'dia', 'dias')}`}</p>
                    </td>
                    <td className="px-4 py-3"><Status tone={late ? 'danger' : 'warning'}>{late ? 'Vencida' : 'Pendente'}</Status></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <form action={whatsappPaymentAction}>
                          <input type="hidden" name="chargeId" value={charge.id} />
                          <Button type="submit" variant="outline" disabled={!charge.payment_url} title={charge.payment_url ? undefined : 'A cobrança ainda não tem link de pagamento.'}><MessageCircle />Mandar no WhatsApp</Button>
                        </form>
                        <CopyButton text={charge.payment_url ?? ''} label="Copiar link" disabled={!charge.payment_url} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}

        <SectionTitle title="Pagas" count={paid.length} hint={`últimos ${PAID_WINDOW_DAYS} dias`} />
        {paid.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-sm text-muted-foreground">Nenhum pagamento nos últimos {PAID_WINDOW_DAYS} dias.</p>
        ) : (
          <Card>
            <Table head={['Cliente', 'Valor', 'Pagamento', 'Status']}>
              {paid.map((row) => (
                <tr key={row.charge.id} className="hover:bg-accent/40">
                  <Who row={row} />
                  <Money cents={row.charge.amount_cents} />
                  <td className="px-4 py-3">{METHOD[row.charge.method]} · pago {formatDate(row.charge.paid_at ?? row.charge.created_at).slice(0, 5)}</td>
                  <td className="px-4 py-3"><Status tone="success">Paga</Status></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
        <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          <Info className="size-4" />Histórico completo de cada cliente na tela <Link href="/painel/clientes" className="underline">Clientes</Link>. Serviço sem contrato é cobrado direto na tela do cliente.
        </p>
      </main>

      {target && (
        <ChargeDrawer
          clientId={target.client.id}
          clientName={target.client.legal_name}
          services={[target.service]}
          closeHref={BACK}
          back={BACK}
          reopen={`${BACK}?cobrar=${target.service.id}`}
          error={erro}
          initial={{
            serviceId: target.service.id,
            description: target.service.name,
            amount: formatBRL(target.service.amount_cents),
            dueDate: target.service.first_due_date ?? undefined,
            method: target.service.payment_method ?? undefined,
            cycle: target.service.kind === 'recorrente' ? toAsaasCycle(target.service.cycle) : undefined,
          }}
        />
      )}
    </>
  );
}
