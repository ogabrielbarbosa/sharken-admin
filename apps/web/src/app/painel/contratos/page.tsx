import { listContractsWithClient, OPTED_OUT_MESSAGE } from '@lps/db';
import { formatBRL, phoneMatchCandidates, toMobileE164, type ContractStatus } from '@lps/domain';
import { FileText, Info, MessageCircle, Pencil, Send } from 'lucide-react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/topbar';
import { Button, Card, EmptyState, ErrorNote, LinkButton, Status, Table, type Tone } from '@/components/ui';
import { CopyButton } from '@/components/ui/copy-button';
import { MenuButton, RowMenu } from '@/components/ui/row-menu';
import { authedDb } from '@/lib/auth';
import { formatDate } from '@/lib/lead-labels';
import { openContractAction, sendContractAction } from '../clientes/actions';
import { whatsappContractAction } from './actions';

const STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  enviado: { label: 'Enviado', tone: 'warning' },
  assinado: { label: 'Assinado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'danger' },
};
const ORDER = Object.keys(STATUS) as ContractStatus[];
const BACK = '/painel/contratos';

export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ status?: string; contrato?: string; erro?: string }> }) {
  const { status, contrato, erro } = await searchParams;
  const filter = ORDER.find((s) => s === status);
  const db = await authedDb();
  const [all, rows] = await Promise.all([listContractsWithClient(db), filter ? listContractsWithClient(db, filter) : null]);
  const shown = rows ?? all;
  const phones = [...new Set(all.map((r) => toMobileE164(r.client.phone)).filter((p): p is string => !!p))];
  const { data: blockedRows } = phones.length ? await db.from('do_not_contact').select('phone_e164').in('phone_e164', phones.flatMap(phoneMatchCandidates)) : { data: [] };
  const blockedPhones = new Set((blockedRows as { phone_e164: string }[] | null)?.map((r) => r.phone_e164) ?? []);
  const contactIds = [...new Set(all.flatMap((r) => (r.client.contact_id ? [r.client.contact_id] : [])))];
  const { data: stopped } = contactIds.length ? await db.from('contacts').select('id').eq('status', 'nao_contatar').in('id', contactIds) : { data: [] };
  const stoppedIds = new Set((stopped as { id: string }[] | null)?.map((r) => r.id) ?? []);
  const optedOut = (c: { phone: string | null; contact_id: string | null }) =>
    (!!c.contact_id && stoppedIds.has(c.contact_id)) || phoneMatchCandidates(toMobileE164(c.phone) ?? '').some((p) => blockedPhones.has(p));
  const count = (s: ContractStatus) => all.filter((r) => r.contract.status === s).length;
  const tabs: { key: ContractStatus | undefined; label: string; n: number }[] = [
    { key: undefined, label: 'Todos', n: all.length },
    ...ORDER.map((s) => ({ key: s, label: STATUS[s].label, n: count(s) })),
  ];

  return (
    <>
      <Topbar crumbs={[{ label: 'Contratos' }]} />
      <main className="p-4 lg:p-6">
        {erro && <div className="mb-4"><ErrorNote>{erro}</ErrorNote></div>}
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar por status">
          {tabs.map((t) => {
            const active = t.key === filter;
            return (
              <Link key={t.label} href={t.key ? `${BACK}?status=${t.key}` : BACK} aria-current={active ? 'page' : undefined}
                className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-neutral-700'}`}>
                {t.label}<span className="text-xs opacity-70">{t.n}</span>
              </Link>
            );
          })}
        </nav>
        {shown.length === 0 ? (
          <EmptyState title="Nenhum contrato por aqui" description="Os contratos nascem quando você fecha um negócio no CRM." />
        ) : (
          <Card>
            <Table head={['Cliente', 'Serviço', 'Valor', 'Status', 'Atualizado', '']}>
              {shown.map(({ contract, service, client }) => {
                const info = STATUS[contract.status];
                const editable = contract.status === 'rascunho' || contract.status === 'recusado';
                const hasPhone = !!client.contact_id || !!toMobileE164(client.phone);
                const clientHref = `/painel/clientes/${client.id}`;
                return (
                  <tr key={contract.id} className={contract.id === contrato ? 'bg-accent/60' : 'hover:bg-accent/40'} aria-current={contract.id === contrato ? 'true' : undefined}>
                    <td className="px-4 py-3">
                      <Link href={clientHref} className="font-medium hover:underline">{client.legal_name}</Link>
                      {client.contact_name && <p className="text-xs text-muted-foreground">Assina: {client.contact_name}</p>}
                    </td>
                    <td className="px-4 py-3">{service.name} · {service.kind === 'unico' ? 'único' : 'mensal'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{formatBRL(service.amount_cents)}{service.kind === 'recorrente' ? '/mês' : ''}</td>
                    <td className="px-4 py-3"><Status tone={info.tone}>{info.label}</Status></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(contract.status_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {contract.status === 'rascunho' && (
                          <form action={sendContractAction}>
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="back" value={`${BACK}?contrato=${contract.id}`} />
                            <Button type="submit" variant="primary"><Send />Enviar para assinatura</Button>
                          </form>
                        )}
                        {contract.status === 'enviado' && contract.sign_url && (
                          <>
                            <form action={whatsappContractAction}>
                              <input type="hidden" name="clientId" value={client.id} />
                              <input type="hidden" name="signUrl" value={contract.sign_url} />
                              <Button type="submit" variant="outline" disabled={!hasPhone || optedOut(client)} title={optedOut(client) ? OPTED_OUT_MESSAGE : hasPhone ? undefined : 'O cliente não tem celular cadastrado.'}><MessageCircle />Mandar no WhatsApp</Button>
                            </form>
                            <CopyButton text={contract.sign_url} label="Copiar link" />
                          </>
                        )}
                        {contract.status === 'assinado' && contract.zapsign_doc_token && (
                          <form action={openContractAction}>
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="back" value={BACK} />
                            <Button type="submit" variant="outline"><FileText />Abrir PDF</Button>
                          </form>
                        )}
                        {contract.status === 'recusado' && <LinkButton href={clientHref} variant="outline"><Pencil />Corrigir e reenviar</LinkButton>}
                        <RowMenu>
                          {editable && <Link href={clientHref} className="rounded-sm px-2 py-1.5 text-left text-sm hover:bg-neutral-700">Editar</Link>}
                          <Link href={clientHref} className="rounded-sm px-2 py-1.5 text-left text-sm hover:bg-neutral-700">Abrir cliente</Link>
                          {contract.status !== 'assinado' && contract.zapsign_doc_token && (
                            <form action={openContractAction}>
                              <input type="hidden" name="contractId" value={contract.id} />
                              <input type="hidden" name="back" value={BACK} />
                              <MenuButton>Abrir PDF</MenuButton>
                            </form>
                          )}
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        )}
        <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          <Info className="size-4" />Assinado: o serviço vai para Pagamentos em “Pronto para cobrar”, com o combinado preenchido.
        </p>
      </main>
    </>
  );
}
