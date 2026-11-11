import { getClient, getLead, listCharges, listContracts, listServices } from '@lps/db';
import { clientStanding, formatBRL, formatDocument, summarizeCharges, type ChargeStatus, type ContractStatus } from '@lps/domain';
import { ArrowLeft, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientDrawer } from '@/components/clients/client-drawer';
import { Topbar } from '@/components/layout/topbar';
import { Badge, Button, Card, Drawer, ErrorNote, Field, Input, LinkButton, Select, Status, Table, Textarea, type Tone } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { MenuButton, RowMenu } from '@/components/ui/row-menu';
import { authedDb } from '@/lib/auth';
import { formatDate } from '@/lib/lead-labels';
import { cancelChargeAction, createChargeAction, createServiceAction, openContractAction, saveClientAction, sendContractAction, setServiceStatusAction } from '../actions';

const CONTRACT: Record<ContractStatus, { label: string; tone: Tone; prefix: string }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral', prefix: 'Criado em' },
  enviado: { label: 'Enviado', tone: 'warning', prefix: 'Enviado em' },
  assinado: { label: 'Assinado', tone: 'success', prefix: 'Assinado em' },
  recusado: { label: 'Recusado', tone: 'danger', prefix: 'Recusado em' },
};
const CHARGE: Record<ChargeStatus, { label: string; tone: Tone }> = {
  pendente: { label: 'Pendente', tone: 'warning' },
  pago: { label: 'Pago', tone: 'success' },
  vencido: { label: 'Vencido', tone: 'danger' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
};
const SERVICE = { ativo: { label: 'Ativo', tone: 'success' }, concluido: { label: 'Concluído', tone: 'neutral' }, cancelado: { label: 'Cancelado', tone: 'danger' } } as const;
const METHOD = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão' };

const Datum = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm">{children}</dd></div>
);

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ servico?: string; cobranca?: string; editar?: string; erro?: string }> }) {
  const { id } = await params;
  const { servico, cobranca, editar, erro } = await searchParams;
  const db = await authedDb();
  const client = await getClient(db, id);
  if (!client) notFound();
  const services = await listServices(db, id);
  const serviceIds = services.map((s) => s.id);
  const [contracts, charges, lead] = await Promise.all([
    listContracts(db, serviceIds),
    listCharges(db, serviceIds),
    client.lead_id ? getLead(db, client.lead_id) : null,
  ]);
  const summary = summarizeCharges(charges);
  const standing = clientStanding(charges);
  const nameOf = (serviceId: string) => services.find((s) => s.id === serviceId)?.name ?? '—';
  const contractOf = (serviceId: string) => contracts.find((c) => c.service_id === serviceId);
  const here = `/painel/clientes/${id}`;
  const billable = services.filter((s) => s.status === 'ativo');
  const percent = summary.invoiced ? Math.round((summary.received / summary.invoiced) * 100) : 0;
  const drawerOpen = servico || cobranca || editar;

  return (
    <>
      <Topbar crumbs={[{ label: 'Clientes', href: '/painel/clientes' }, { label: client.legal_name }]} />
      <main className="space-y-4 p-4 lg:p-6">
        <Link href="/painel/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar para Clientes</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{client.legal_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={standing === 'em_dia' ? 'success' : 'danger'}>{standing === 'em_dia' ? 'Em dia' : 'Em atraso'}</Badge>
              Cliente desde {formatDate(client.created_at)}{client.location && ` · ${client.location}`}
            </div>
          </div>
          <div className="flex gap-2">
            <LinkButton href={`${here}?editar=1`} variant="outline">Editar</LinkButton>
            <LinkButton href={`${here}?servico=1`}><Plus />Novo serviço</LinkButton>
          </div>
        </div>
        {erro && !drawerOpen && <ErrorNote>{erro}</ErrorNote>}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-4 font-medium">Dados do cliente</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Datum label="Nome ou razão social">{client.legal_name}</Datum>
              <Datum label="CPF/CNPJ">{formatDocument(client.document)}</Datum>
              <Datum label="Responsável">{client.contact_name ?? '—'}</Datum>
              <Datum label="E-mail">{client.email ?? '—'}</Datum>
              <Datum label="Telefone">{client.phone ?? '—'}</Datum>
              <Datum label="Endereço">{client.address ?? '—'}</Datum>
              {lead && <Datum label="Lead de origem"><Link href={`/painel/leads/${lead.id}`} className="underline">{lead.name}</Link></Datum>}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-medium">Resumo financeiro</h2>
            <dl className="grid grid-cols-2 gap-3">
              {([['Faturado', summary.invoiced, ''], ['Recebido', summary.received, 'text-success-foreground'], ['Em aberto', summary.open, 'text-warning'], ['Em atraso', summary.overdue, 'text-destructive']] as const).map(([label, value, color]) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={`mt-1 text-lg font-semibold ${color}`}>{formatBRL(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-success" style={{ width: `${percent}%` }} /></div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{percent}% do faturado</p>
          </Card>
        </div>

        <Card>
          <h2 className="flex items-center gap-2 px-4 py-3 font-medium">Serviços <Badge>{services.length}</Badge></h2>
          {services.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum serviço ainda.</p> : (
            <Table head={['Serviço', 'Tipo', 'Valor', 'Início', 'Status', 'Contrato', '']}>
              {services.map((s) => {
                const contract = contractOf(s.id);
                const c = contract ? CONTRACT[contract.status] : null;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.kind === 'unico' ? 'Único' : 'Recorrente'}</td>
                    <td className="px-4 py-3">{formatBRL(s.amount_cents)}</td>
                    <td className="px-4 py-3">{formatDate(`${s.start_date}T12:00:00`)}</td>
                    <td className="px-4 py-3"><Status tone={SERVICE[s.status].tone}>{SERVICE[s.status].label}</Status></td>
                    <td className="px-4 py-3">{c && <Status tone={c.tone}>{c.label}</Status>}</td>
                    <td className="px-4 py-3 text-right">
                      {s.status === 'ativo' && (
                        <RowMenu>
                          {(['concluido', 'cancelado'] as const).map((status) => (
                            <form key={status} action={setServiceStatusAction}>
                              <input type="hidden" name="serviceId" value={s.id} />
                              <input type="hidden" name="status" value={status} />
                              <MenuButton>{status === 'concluido' ? 'Concluir serviço' : 'Cancelar serviço'}</MenuButton>
                            </form>
                          ))}
                        </RowMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 px-4 py-3 font-medium">Contratos <Badge>{contracts.length}</Badge><span className="text-xs font-normal text-muted-foreground">Assinatura pelo ZapSign</span></h2>
          {contracts.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">O contrato é criado junto com o serviço.</p> : (
            <Table head={['Serviço', 'Status', 'Data', '']}>
              {contracts.map((c) => {
                const info = CONTRACT[c.status];
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{nameOf(c.service_id)}</td>
                    <td className="px-4 py-3"><Status tone={info.tone}>{info.label}</Status></td>
                    <td className="px-4 py-3 text-muted-foreground">{info.prefix} {formatDate(c.status_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {(c.status === 'rascunho' || c.status === 'recusado') && (
                          <form action={sendContractAction}>
                            <input type="hidden" name="contractId" value={c.id} />
                            <Button type="submit" variant="outline"><Send />{c.status === 'recusado' ? 'Reenviar' : 'Enviar para assinatura'}</Button>
                          </form>
                        )}
                        {c.status === 'enviado' && c.sign_url && <CopyButton text={c.sign_url} label="Copiar link de assinatura" />}
                        {c.zapsign_doc_token && (
                          <form action={openContractAction}>
                            <input type="hidden" name="contractId" value={c.id} />
                            <Button type="submit" variant="ghost">Abrir contrato</Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="flex items-center gap-2 font-medium">Cobranças <Badge>{charges.length}</Badge><span className="text-xs font-normal text-muted-foreground">Cobrança pelo Asaas</span></h2>
            {billable.length > 0 && <LinkButton href={`${here}?cobranca=1`} variant="outline"><Plus />Nova cobrança</LinkButton>}
          </div>
          {charges.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhuma cobrança ainda.</p> : (
            <Table head={['Serviço', 'Descrição', 'Valor', 'Vencimento', 'Forma', 'Status', '']}>
              {charges.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{nameOf(c.service_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.description}</td>
                  <td className="px-4 py-3">{formatBRL(c.amount_cents)}</td>
                  <td className="px-4 py-3">{formatDate(`${c.due_date}T12:00:00`)}</td>
                  <td className="px-4 py-3">{METHOD[c.method]}</td>
                  <td className="px-4 py-3"><Status tone={CHARGE[c.status].tone}>{CHARGE[c.status].label}</Status></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {(c.status === 'pendente' || c.status === 'vencido') && c.payment_url && <CopyButton text={c.payment_url} label="Copiar link de pagamento" />}
                      {(c.status === 'pendente' || c.status === 'vencido') && (
                        <RowMenu>
                          <form action={cancelChargeAction}><input type="hidden" name="chargeId" value={c.id} /><MenuButton>Cancelar cobrança</MenuButton></form>
                        </RowMenu>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </main>

      {editar && <ClientDrawer title="Editar cliente" closeHref={here} clientId={id} draft={{ ...client, contact_name: client.contact_name ?? '', email: client.email ?? '', phone: client.phone ?? '', address: client.address ?? '', location: client.location ?? '', lead_id: null }} action={saveClientAction} submitLabel="Salvar" error={erro} />}

      {servico && (
        <Drawer title="Novo serviço" subtitle={client.legal_name} closeHref={here}>
          <form action={createServiceAction} className="flex flex-1 flex-col gap-4">
            <input type="hidden" name="clientId" value={id} />
            <Field label="Nome do serviço"><Input name="name" required /></Field>
            <Field label="Tipo"><Select name="kind" defaultValue="unico"><option value="unico">Único</option><option value="recorrente">Recorrente</option></Select></Field>
            <Field label="Valor"><Input name="amount" placeholder="R$ 450,00" required /></Field>
            <Field label="Data de início"><Input name="start_date" type="date" required /></Field>
            <Field label="Observações"><Textarea name="notes" rows={3} placeholder="Escopo, prazos ou combinados com o cliente." /></Field>
            <p className="text-xs text-muted-foreground">O contrato do serviço é criado como rascunho. Você envia para assinatura pelo ZapSign quando quiser.</p>
            {erro && <ErrorNote>{erro}</ErrorNote>}
            <div className="mt-auto pt-4"><Button type="submit" className="w-full">Salvar serviço</Button></div>
          </form>
        </Drawer>
      )}

      {cobranca && (
        <Drawer title="Nova cobrança" subtitle={client.legal_name} closeHref={here}>
          <form action={createChargeAction} className="flex flex-1 flex-col gap-4">
            <input type="hidden" name="clientId" value={id} />
            <Field label="Serviço">
              <Select name="serviceId">{billable.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === 'recorrente' ? ' (recorrente)' : ''}</option>)}</Select>
            </Field>
            <Field label="Descrição"><Input name="description" required /></Field>
            <Field label="Valor"><Input name="amount" placeholder="R$ 89,00" required /></Field>
            <Field label="Vencimento"><Input name="due_date" type="date" required /></Field>
            <Field label="Forma de pagamento"><Select name="method" defaultValue="pix"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option></Select></Field>
            {billable.some((s) => s.kind === 'recorrente') && (
              <Field label="Periodicidade" hint="Vale só para serviço recorrente. O Asaas gera uma cobrança a cada período.">
                <Select name="cycle" defaultValue="MONTHLY">
                  <option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensal</option><option value="QUARTERLY">Trimestral</option><option value="SEMIANNUALLY">Semestral</option><option value="YEARLY">Anual</option>
                </Select>
              </Field>
            )}
            <p className="text-xs text-muted-foreground">A cobrança é criada no Asaas. Depois, copie o link de pagamento e envie ao cliente.</p>
            {erro && <ErrorNote>{erro}</ErrorNote>}
            <div className="mt-auto pt-4"><Button type="submit" className="w-full">Gerar cobrança</Button></div>
          </form>
        </Drawer>
      )}
    </>
  );
}
