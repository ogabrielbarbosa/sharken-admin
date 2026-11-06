import { listCharges, listClients, listContracts, listServices } from '@lps/db';
import { clientStanding, formatBRL, summarizeCharges } from '@lps/domain';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { ClientDrawer } from '@/components/clients/client-drawer';
import { Topbar } from '@/components/layout/topbar';
import { Card, EmptyState, Input, LinkButton, PageHeader, Status, Table } from '@/components/ui';
import { authedDb } from '@/lib/auth';
import { createNewClientAction } from './actions';

const Stat = ({ label, value, note }: { label: string; value: string | number; note: string }) => (
  <Card className="p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{note}</p>
  </Card>
);

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; novo?: string; erro?: string; situacao?: string }> }) {
  const { q, novo, erro, situacao } = await searchParams;
  const db = await authedDb();
  const [clients, services, contracts, charges] = await Promise.all([listClients(db), listServices(db), listContracts(db), listCharges(db)]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const serviceClient = new Map(services.map((s) => [s.id, s.client_id]));
  const totals = summarizeCharges(charges);
  const monthInvoiced = summarizeCharges(charges.filter((c) => new Date(c.created_at) >= monthStart)).invoiced;

  const rows = clients.map((client) => {
    const own = charges.filter((c) => serviceClient.get(c.service_id) === client.id);
    const ownServices = services.filter((s) => s.client_id === client.id);
    const ownContracts = contracts.filter((c) => ownServices.some((s) => s.id === c.service_id));
    const signed = ownContracts.filter((c) => c.status === 'assinado').length;
    const sent = ownContracts.filter((c) => c.status === 'enviado').length;
    const contractLabel = [signed && `${signed} ${signed === 1 ? 'assinado' : 'assinados'}`, sent && `${sent} ${sent === 1 ? 'enviado' : 'enviados'}`].filter(Boolean).join(' · ') || '—';
    return { client, summary: summarizeCharges(own), standing: clientStanding(own), servicesCount: ownServices.length, contractLabel };
  }).filter(({ client, standing }) => {
    if (situacao === 'em_atraso' && standing !== 'em_atraso') return false;
    return !q || `${client.legal_name} ${client.contact_name ?? ''} ${client.document}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <Topbar crumbs={[{ label: 'Clientes' }]} />
      <main className="p-4 lg:p-6">
        <PageHeader
          title="Clientes"
          description="Negócios que fecharam com você, com serviços, contratos e cobranças."
          actions={
            <>
              <form className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input name="q" defaultValue={q} placeholder="Buscar cliente…" className="w-56 pl-8" />
              </form>
              <LinkButton href="/painel/clientes?novo=1"><Plus />Novo cliente</LinkButton>
            </>
          }
        />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Clientes" value={clients.length} note={`${clients.filter((c) => new Date(c.created_at) >= monthStart).length} novos este mês`} />
          <Stat label="Total faturado" value={formatBRL(totals.invoiced)} note={`${formatBRL(monthInvoiced)} este mês`} />
          <Stat label="Total recebido" value={formatBRL(totals.received)} note={`${totals.invoiced ? Math.round((totals.received / totals.invoiced) * 100) : 0}% do faturado`} />
          <Stat label="Total em aberto" value={formatBRL(totals.open)} note={`${formatBRL(totals.overdue)} em atraso`} />
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum cliente por aqui" description="Cadastre um cliente a partir de uma venda ou pelo botão Novo cliente." />
        ) : (
          <Card>
            <Table head={['Cliente', 'Localização', 'Serviços', 'Contrato', 'Faturado', 'Em aberto', 'Situação']}>
              {rows.map(({ client, summary, standing, servicesCount, contractLabel }) => (
                <tr key={client.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <Link href={`/painel/clientes/${client.id}`} className="font-medium hover:underline">{client.legal_name}</Link>
                    {client.contact_name && <p className="text-xs text-muted-foreground">{client.contact_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{client.location ?? '—'}</td>
                  <td className="px-4 py-3">{servicesCount}</td>
                  <td className="px-4 py-3">{contractLabel}</td>
                  <td className="px-4 py-3">{formatBRL(summary.invoiced)}</td>
                  <td className="px-4 py-3">{formatBRL(summary.open)}</td>
                  <td className="px-4 py-3"><Status tone={standing === 'em_dia' ? 'success' : 'danger'}>{standing === 'em_dia' ? 'Em dia' : 'Em atraso'}</Status></td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </main>
      {novo && <ClientDrawer title="Novo cliente" closeHref="/painel/clientes" draft={{}} action={createNewClientAction} submitLabel="Salvar e adicionar serviço" error={erro} />}
    </>
  );
}
