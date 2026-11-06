import { clientsByLead, getLead, listLeads } from '@lps/db';
import { clientDraftFromLead } from '@lps/domain';
import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';
import { createClientFromLeadAction } from '@/app/painel/clientes/actions';
import { ClientDrawer } from '@/components/clients/client-drawer';
import { Card, EmptyState, LinkButton, PageHeader, Status, Table } from '@/components/ui';
import { loadBatchContext } from '@/lib/batch-context';
import { formatDate } from '@/lib/lead-labels';

export default async function VendidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cadastrar?: string; erro?: string }> }) {
  const { id } = await params;
  const { cadastrar, erro } = await searchParams;
  const { db, batch } = await loadBatchContext(id);
  const leads = await listLeads(db, id, ['vendido']);
  const clients = await clientsByLead(db, leads.map((l) => l.id));
  const lead = cadastrar ? await getLead(db, cadastrar) : null;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const here = `/painel/batches/${id}/vendido`;

  return (
    <>
      <PageHeader
        title="Vendido"
        description="Fim do processo. Negócios deste batch que fecharam com você."
        actions={<span className="text-sm text-muted-foreground">Vendas: <b className="text-foreground">{leads.length}</b> · Este mês: <b className="text-foreground">{leads.filter((l) => l.sold_at && new Date(l.sold_at) >= monthStart).length}</b></span>}
      />
      {leads.length === 0 ? <EmptyState icon={<BadgeCheck />} title="Nenhuma venda neste batch" description="Marque a venda em Conversa e ela aparece aqui." /> : (
        <Card>
          <Table head={['Nome', 'Localização', 'Tipo de negócio', 'Data da venda', 'Cliente', '']}>
            {leads.map((l) => {
              const clientId = clients.get(l.id);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium"><Link href={`/painel/leads/${l.id}`} className="hover:underline">{l.name}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">{batch.location}</td>
                  <td className="px-4 py-3 text-muted-foreground">{batch.business_type}</td>
                  <td className="px-4 py-3">{formatDate(l.sold_at)}</td>
                  <td className="px-4 py-3"><Status tone={clientId ? 'success' : 'warning'}>{clientId ? 'Cadastrado' : 'A cadastrar'}</Status></td>
                  <td className="px-4 py-3 text-right">
                    {clientId
                      ? <LinkButton href={`/painel/clientes/${clientId}`} variant="ghost">Ver cliente</LinkButton>
                      : <LinkButton href={`${here}?cadastrar=${l.id}`} variant="outline">Cadastrar cliente</LinkButton>}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Vendido é a última etapa. Leads aqui não voltam para a fila de contato.</p>
        </Card>
      )}
      {lead && (
        <ClientDrawer title="Cadastrar cliente" subtitle={`${lead.name} · vendido em ${formatDate(lead.sold_at)}`} closeHref={here} draft={clientDraftFromLead(lead)} action={createClientFromLeadAction} submitLabel="Salvar e adicionar serviço" error={erro} />
      )}
    </>
  );
}
