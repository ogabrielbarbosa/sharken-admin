import { listCharges, listClients, listContracts, listReadyToCharge, listServices, type ChargeRecord, type ContractRecord, type ServiceRecord } from '@lps/db';
import { CYCLES, clientStanding, formatBRL, normalizeDocument, summarizeCharges } from '@lps/domain';
import { BadgeDollarSign, CircleDollarSign, Hourglass, Plus, Receipt, Search, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ChargeDrawer } from '@/components/clients/charge-drawer';
import { ClientDrawer } from '@/components/clients/client-drawer';
import { ExpandableRow } from '@/components/clients/expandable-row';
import { Topbar } from '@/components/layout/topbar';
import { Card, EmptyState, Input, LinkButton, Status, Table } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { createNewClientAction } from './actions';

const Stat = ({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: LucideIcon }) => (
  <Card interactive className="p-4">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <span className="grid size-7 place-items-center rounded-md border border-brand-border bg-brand-muted text-brand-soft"><Icon className="size-3.5" /></span>
    </div>
    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
  </Card>
);

const HERE = '/painel/clientes';
const CONTRACT: Record<ContractRecord['status'], string> = { rascunho: 'Contrato em rascunho', enviado: 'Contrato enviado', recusado: 'Contrato recusado', assinado: 'Contrato assinado' };
const kindLabel = (s: ServiceRecord) => (s.kind === 'unico' ? 'Único' : (CYCLES.find((c) => c.value === s.cycle)?.label ?? 'Mensal'));
type Tone = 'success' | 'warning' | 'danger' | 'neutral';

/** O que falta (ou não) em cada serviço, na ordem em que importa. */
function serviceState(service: ServiceRecord, charges: ChargeRecord[], contract: ContractRecord | undefined, ready: boolean): { tone: Tone; label: string } {
  if (service.status === 'cancelado') return { tone: 'neutral', label: 'Cancelado' };
  if (charges.some((c) => c.status === 'vencido')) return { tone: 'danger', label: 'Em atraso' };
  if (ready) return { tone: 'warning', label: 'Pronto para cobrar' };
  if (charges.some((c) => c.status === 'pendente')) return { tone: 'warning', label: 'Aguardando pagamento' };
  if (service.asaas_subscription_id || service.abacate_subscription_id) return { tone: 'success', label: 'Recorrente ativa' };
  if (charges.some((c) => c.status === 'pago')) return { tone: 'success', label: 'Pago' };
  return { tone: 'neutral', label: contract ? CONTRACT[contract.status] : 'Sem contrato' };
}

function ServiceList({ services, charges, contracts, ready }: { services: ServiceRecord[]; charges: ChargeRecord[]; contracts: ContractRecord[]; ready: Set<string> }) {
  if (!services.length) return <p className="py-2 text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {services.map((service) => {
        const own = charges.filter((c) => c.service_id === service.id);
        const contract = contracts.filter((c) => c.service_id === service.id).sort((a, b) => +new Date(b.status_at) - +new Date(a.status_at))[0];
        const isReady = ready.has(service.id);
        const state = serviceState(service, own, contract, isReady);
        const sum = summarizeCharges(own);
        return (
          <li key={service.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{service.name}</p>
              <p className="text-xs text-muted-foreground">{kindLabel(service)} · {formatBRL(service.amount_cents)}{contract ? ` · ${CONTRACT[contract.status].toLowerCase()}` : ''}</p>
            </div>
            <div className="w-28 text-xs"><p className="text-muted-foreground">Recebido</p><p className="tabular-nums">{formatBRL(sum.received)}</p></div>
            <div className="w-28 text-xs"><p className="text-muted-foreground">Em aberto</p><p className="tabular-nums">{formatBRL(isReady ? service.amount_cents : sum.open)}</p></div>
            <div className="w-44"><Status tone={state.tone}>{state.label}</Status></div>
            <div className="flex w-40 justify-end">
              {isReady && <LinkButton href={`${HERE}?cobrar=${service.id}`} variant="outline"><Receipt />Gerar cobrança</LinkButton>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; novo?: string; erro?: string; situacao?: string; cobrar?: string }> }) {
  const { q, novo, erro, situacao, cobrar } = await searchParams;
  const db = await authedDb();
  const [clients, services, contracts, charges, readyRows] = await Promise.all([listClients(db), listServices(db), listContracts(db), listCharges(db), listReadyToCharge(db)]);
  const ready = new Set(readyRows.map((r) => r.service.id));
  const readyTotal = readyRows.reduce((total, r) => total + r.service.amount_cents, 0);
  const target = cobrar ? readyRows.find((r) => r.service.id === cobrar) : undefined;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const totals = summarizeCharges(charges);
  const monthInvoiced = summarizeCharges(charges.filter((c) => new Date(c.created_at) >= monthStart)).invoiced;

  const rows = clients.map((client) => {
    const ownServices = services.filter((s) => s.client_id === client.id);
    const ids = new Set(ownServices.map((s) => s.id));
    const own = charges.filter((c) => ids.has(c.service_id));
    const toCharge = ownServices.filter((s) => ready.has(s.id));
    const standing = clientStanding(own) === 'em_atraso' ? 'em_atraso' : toCharge.length ? 'a_cobrar' : 'em_dia';
    return {
      client, standing, summary: summarizeCharges(own), services: ownServices, charges: own,
      contracts: contracts.filter((c) => ids.has(c.service_id)),
      readyAmount: toCharge.reduce((total, s) => total + s.amount_cents, 0),
    };
  }).filter(({ client, standing }) => {
    if ((situacao === 'em_atraso' || situacao === 'a_cobrar') && standing !== situacao) return false;
    const nq = normalizeDocument(q ?? '');
    return !q || `${client.legal_name} ${client.contact_name ?? ''}`.toLowerCase().includes(q.toLowerCase()) || (!!nq && normalizeDocument(client.document).includes(nq));
  });

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Clientes' }]}
        actions={
          <>
            <form className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Buscar cliente…" aria-label="Buscar cliente" className="w-40 pl-8 sm:w-56" />
            </form>
            <LinkButton href="/painel/clientes?novo=1"><Plus /><span className="max-sm:sr-only">Novo cliente</span></LinkButton>
          </>
        }
      />
      <main className="p-4 lg:p-6">
        <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Users} label="Clientes" value={clients.length} note={`${clients.filter((c) => new Date(c.created_at) >= monthStart).length} novos este mês`} />
          <Stat icon={BadgeDollarSign} label="Total faturado" value={formatBRL(totals.invoiced)} note={`${formatBRL(monthInvoiced)} este mês`} />
          <Stat icon={CircleDollarSign} label="Total recebido" value={formatBRL(totals.received)} note={`${totals.invoiced ? Math.round((totals.received / totals.invoiced) * 100) : 0}% do faturado`} />
          <Stat icon={Hourglass} label="Total em aberto" value={formatBRL(totals.open + readyTotal)} note={`${formatBRL(totals.overdue)} em atraso${readyTotal ? ` · ${formatBRL(readyTotal)} a cobrar` : ''}`} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Users />} title="Nenhum cliente por aqui" description="Cadastre um cliente a partir de uma venda ou pelo botão Novo cliente." />
        ) : (
          <Card>
            <Table head={['', 'Cliente', 'Localização', 'Serviços', 'Recebido', 'Em aberto', 'Situação']}>
              {rows.map(({ client, summary, standing, services: own, charges: ownCharges, contracts: ownContracts, readyAmount }) => (
                <ExpandableRow
                  key={client.id}
                  label={client.legal_name}
                  colSpan={7}
                  details={<ServiceList services={own} charges={ownCharges} contracts={ownContracts} ready={ready} />}
                  cells={
                    <>
                      <td className="px-4 py-3">
                        <Link href={`/painel/clientes/${client.id}`} className="font-medium transition-colors hover:text-brand-light">{client.legal_name}</Link>
                        {client.contact_name && <p className="text-xs text-muted-foreground">{client.contact_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{client.location ?? '—'}</td>
                      <td className="px-4 py-3">{own.length}</td>
                      <td className="px-4 py-3 tabular-nums">{formatBRL(summary.received)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatBRL(summary.open + readyAmount)}
                        {readyAmount > 0 && <p className="text-xs text-muted-foreground">{formatBRL(readyAmount)} a cobrar</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Status tone={standing === 'em_dia' ? 'success' : standing === 'a_cobrar' ? 'warning' : 'danger'}>{standing === 'em_dia' ? 'Em dia' : standing === 'a_cobrar' ? 'A cobrar' : 'Em atraso'}</Status>
                      </td>
                    </>
                  }
                />
              ))}
            </Table>
          </Card>
        )}
      </main>
      {target && (
        <ChargeDrawer
          clientId={target.client.id}
          clientName={target.client.legal_name}
          services={[target.service]}
          closeHref={HERE}
          back={HERE}
          reopen={`${HERE}?cobrar=${target.service.id}`}
          error={erro}
          initial={{
            serviceId: target.service.id,
            description: target.service.name,
            amount: formatBRL(target.service.amount_cents),
            dueDate: target.service.first_due_date ?? undefined,
            method: target.service.payment_method ?? undefined,
            cycle: target.service.kind === 'recorrente' ? (target.service.cycle ?? undefined) : undefined,
          }}
        />
      )}
      {novo && <ClientDrawer title="Novo cliente" closeHref="/painel/clientes" draft={{}} action={createNewClientAction} submitLabel="Salvar e adicionar serviço" error={erro} />}
    </>
  );
}
