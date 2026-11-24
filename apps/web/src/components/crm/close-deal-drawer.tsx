'use client';

import { CYCLES, formatBRL, formatDocument, formatPhone, parseBRLToCents, PAYMENT_METHODS, type ChargeMethod, type CloseDealInput, type Cycle } from '@lps/domain';
import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { closeDealAction } from '@/app/painel/crm/actions';
import { Button, Drawer, ErrorNote, Input, Select, Textarea } from '@/components/ui';

const today = () => new Date().toISOString().slice(0, 10);

function Block({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-xs">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Labeled({ label, fromCrm, error, children }: { label: string; fromCrm?: boolean; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}{fromCrm && <span className="font-normal text-muted-foreground"> · do CRM</span>}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export type CatalogOption = { id: string; name: string; kind: 'unico' | 'recorrente'; amount_cents: number; cycle: Cycle | null; description: string | null };

/** Drawer de Fechar negócio. O servidor valida de novo e grava tudo numa transação. */
export function CloseDealDrawer({ contactName, defaults, existingClient, closeHref, catalog = [] }: { contactName: string; defaults: CloseDealInput; existingClient: boolean; closeHref: string; catalog?: CatalogOption[] }) {
  const router = useRouter();
  const requestId = useRef(crypto.randomUUID());
  const [client, setClient] = useState({ ...defaults.client, phone: formatPhone(defaults.client.phone), document: formatDocument(defaults.client.document) });
  const [service, setService] = useState({ name: defaults.service.name, kind: defaults.service.kind, notes: defaults.service.notes, start_date: defaults.service.start_date || today() });
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState<{ method: ChargeMethod; first_due_date: string; cycle: Cycle | '' }>({ method: defaults.payment.method, first_due_date: defaults.payment.first_due_date, cycle: defaults.payment.cycle ?? '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [catalogId, setCatalogId] = useState('');
  const crm = (value: string) => !existingClient && !!value;
  /** Escolher do catálogo preenche nome, tipo, valor, periodicidade e observações; dá para ajustar depois. */
  const pick = (id: string) => {
    setCatalogId(id);
    const item = catalog.find((c) => c.id === id);
    if (!item) return;
    setService((s) => ({ ...s, name: item.name, kind: item.kind, notes: item.description ?? s.notes }));
    setAmount(formatBRL(item.amount_cents));
    setPayment((p) => ({ ...p, cycle: item.kind === 'recorrente' ? (item.cycle ?? '') : '', method: item.kind === 'recorrente' && p.method === 'boleto' ? 'cartao' : p.method }));
  };
  const setC = (k: keyof typeof client) => (e: { target: { value: string } }) => setClient((c) => ({ ...c, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: CloseDealInput = {
      contact_id: defaults.contact_id,
      request_id: requestId.current,
      client,
      service: { name: service.name, kind: service.kind, notes: service.notes, start_date: service.start_date, amount_cents: parseBRLToCents(amount) },
      payment: { method: payment.method, first_due_date: payment.first_due_date, cycle: service.kind === 'recorrente' && payment.cycle ? payment.cycle : null },
    };
    start(async () => {
      const out = await closeDealAction(input);
      if (out.ok) {
        router.replace(`/painel/contratos?contrato=${out.contractId}`);
        return;
      }
      setFields(out.fields ?? {});
      setError(out.error);
    });
  };

  return (
    <Drawer title={existingClient ? 'Novo negócio' : 'Fechar negócio'} subtitle={`${contactName} · os campos marcados vieram do CRM`} closeHref={closeHref} wide>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-6">
        <Block n={1} title="Cliente">
          {existingClient && <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">Este contato já é cliente. O serviço novo fica nele, e os campos alterados atualizam o cadastro.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Nome ou razão social" fromCrm={crm(defaults.client.legal_name)} error={fields.legal_name}><Input value={client.legal_name} onChange={setC('legal_name')} required /></Labeled>
            <Labeled label="CPF ou CNPJ" error={fields.document}><Input value={client.document} onChange={setC('document')} placeholder="00.000.000/0000-00" required aria-invalid={!!fields.document} /></Labeled>
            <Labeled label="Quem assina" fromCrm={crm(defaults.client.contact_name)}><Input value={client.contact_name} onChange={setC('contact_name')} placeholder="Nome de quem assina" /></Labeled>
            <Labeled label="Telefone" fromCrm={crm(defaults.client.phone)}><Input value={client.phone} onChange={setC('phone')} /></Labeled>
          </div>
          <Labeled label="E-mail (opcional)" error={fields.email}><Input type="email" value={client.email} onChange={setC('email')} placeholder="email@exemplo.com.br" /></Labeled>
          <Labeled label="Endereço" fromCrm={crm(defaults.client.address)}><Input value={client.address} onChange={setC('address')} /></Labeled>
        </Block>

        <Block n={2} title="Serviço">
          {catalog.length > 0 && (
            <Labeled label="Do catálogo">
              <Select value={catalogId} onValueChange={pick} options={[{ value: '', label: 'Escolha um serviço ou preencha abaixo' }, ...catalog.map((c) => ({ value: c.id, label: `${c.name} · ${formatBRL(c.amount_cents)}${c.kind === 'recorrente' ? ` · ${CYCLES.find((x) => x.value === c.cycle)?.label.toLowerCase() ?? 'recorrente'}` : ''}` }))]} />
            </Labeled>
          )}
          <Labeled label="Serviço" error={fields.service_name}><Input value={service.name} onChange={(e) => setService((s) => ({ ...s, name: e.target.value }))} required /></Labeled>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Tipo</span>
              <div role="radiogroup" aria-label="Tipo" className="flex h-9 gap-1 rounded-md bg-input-bg p-1">
                {(['unico', 'recorrente'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={service.kind === k} onClick={() => setService((s) => ({ ...s, kind: k }))} className={`cursor-pointer rounded px-3 text-sm ${service.kind === k ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {k === 'unico' ? 'Único' : 'Recorrente'}
                  </button>
                ))}
              </div>
            </div>
            <Labeled label="Valor" error={fields.amount}><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="R$ 1.200,00" inputMode="decimal" required /></Labeled>
            <Labeled label="Início" error={fields.start_date}><Input type="date" value={service.start_date} onChange={(e) => setService((s) => ({ ...s, start_date: e.target.value }))} required /></Labeled>
          </div>
          <Labeled label="Observações"><Textarea rows={2} value={service.notes} onChange={(e) => setService((s) => ({ ...s, notes: e.target.value }))} placeholder="Escopo, prazos ou combinados com o cliente." /></Labeled>
        </Block>

        <Block n={3} title="Combinado do pagamento">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Forma" error={fields.method}>
              <Select value={payment.method} onValueChange={(method) => setPayment((p) => ({ ...p, method: method as ChargeMethod }))} options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))} />
            </Labeled>
            <Labeled label="Primeiro vencimento" error={fields.first_due_date}><Input type="date" value={payment.first_due_date} onChange={(e) => setPayment((p) => ({ ...p, first_due_date: e.target.value }))} required /></Labeled>
            {service.kind === 'recorrente' && (
              <Labeled label="Periodicidade" error={fields.cycle}>
                <Select value={payment.cycle} onValueChange={(cycle) => setPayment((p) => ({ ...p, cycle: cycle as Cycle | '' }))} options={[{ value: '', label: 'Escolha' }, ...CYCLES.map((c) => ({ value: c.value, label: c.label }))]} />
              </Labeled>
            )}
          </div>
          <p className="text-xs text-muted-foreground">O combinado não gera cobrança agora. Ele preenche a cobrança em Clientes depois que o contrato for assinado.{service.kind === 'recorrente' && ' Recorrente vira assinatura na AbacatePay: cartão ou Pix Automático.'}</p>
        </Block>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto flex justify-end gap-2 border-t border-border pt-4">
          <Link href={closeHref} scroll={false} className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium hover:bg-accent">Cancelar</Link>
          <Button type="submit" disabled={pending} className="h-9"><FileSignature />{pending ? 'Salvando…' : 'Salvar e criar contrato'}</Button>
        </div>
      </form>
    </Drawer>
  );
}
