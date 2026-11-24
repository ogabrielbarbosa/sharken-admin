import { CYCLES, type ChargeMethod } from '@lps/domain';
import { Button, Drawer, ErrorNote, Field, Input, Select } from '@/components/ui';
import { createChargeAction } from '@/app/painel/clientes/actions';

export type ChargeInitial = { serviceId?: string; description?: string; amount?: string; dueDate?: string; method?: ChargeMethod; cycle?: string };
type ChargeService = { id: string; name: string; kind: 'unico' | 'recorrente' };

/** Drawer Nova cobrança. `initial` preenche os campos (o combinado do contrato); `back` e `reopen` dizem para onde voltar. */
export function ChargeDrawer({ clientId, clientName, services, closeHref, back, reopen, initial = {}, error }: {
  clientId: string; clientName: string; services: ChargeService[]; closeHref: string; back?: string; reopen?: string; initial?: ChargeInitial; error?: string;
}) {
  return (
    <Drawer title="Nova cobrança" subtitle={clientName} closeHref={closeHref}>
      <form action={createChargeAction} className="flex flex-1 flex-col gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        {back && <input type="hidden" name="back" value={back} />}
        {reopen && <input type="hidden" name="reopen" value={reopen} />}
        <Field label="Serviço">
          <Select name="serviceId" defaultValue={initial.serviceId} options={services.map((s) => ({ value: s.id, label: `${s.name}${s.kind === 'recorrente' ? ' (recorrente)' : ''}` }))} />
        </Field>
        <Field label="Descrição"><Input name="description" defaultValue={initial.description} required /></Field>
        <Field label="Valor"><Input name="amount" defaultValue={initial.amount} placeholder="R$ 89,00" required /></Field>
        <Field label="Vencimento" hint="No boleto, vai impresso. No Pix e no cartão, serve para o sistema marcar o atraso."><Input name="due_date" type="date" defaultValue={initial.dueDate} required /></Field>
        <Field label="Forma de pagamento"><Select name="method" defaultValue={initial.method ?? 'pix'} options={[{ value: 'pix', label: 'Pix' }, { value: 'boleto', label: 'Boleto' }, { value: 'cartao', label: 'Cartão' }]} /></Field>
        {services.some((s) => s.kind === 'recorrente') && (
          <Field label="Periodicidade" hint="Vale só para serviço recorrente: vira uma assinatura na AbacatePay, no cartão ou no Pix Automático (boleto não tem assinatura).">
            <Select name="cycle" defaultValue={initial.cycle ?? 'mensal'} options={CYCLES.map((c) => ({ value: c.value, label: c.label }))} />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">A cobrança é criada na AbacatePay deste workspace. Depois, copie o link de pagamento e envie ao cliente. O pagamento confirma sozinho.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto pt-4"><Button type="submit" className="w-full">Gerar cobrança</Button></div>
      </form>
    </Drawer>
  );
}
