import type { ChargeMethod } from '@lps/domain';
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
          <Select name="serviceId" defaultValue={initial.serviceId}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === 'recorrente' ? ' (recorrente)' : ''}</option>)}</Select>
        </Field>
        <Field label="Descrição"><Input name="description" defaultValue={initial.description} required /></Field>
        <Field label="Valor"><Input name="amount" defaultValue={initial.amount} placeholder="R$ 89,00" required /></Field>
        <Field label="Vencimento"><Input name="due_date" type="date" defaultValue={initial.dueDate} required /></Field>
        <Field label="Forma de pagamento"><Select name="method" defaultValue={initial.method ?? 'pix'}><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option></Select></Field>
        {services.some((s) => s.kind === 'recorrente') && (
          <Field label="Periodicidade" hint="Vale só para serviço recorrente. O Asaas gera uma cobrança a cada período.">
            <Select name="cycle" defaultValue={initial.cycle ?? 'MONTHLY'}>
              <option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensal</option><option value="QUARTERLY">Trimestral</option><option value="SEMIANNUALLY">Semestral</option><option value="YEARLY">Anual</option>
            </Select>
          </Field>
        )}
        <p className="text-xs text-muted-foreground">A cobrança é criada no Asaas. Depois, copie o link de pagamento e envie ao cliente.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto pt-4"><Button type="submit" className="w-full">Gerar cobrança</Button></div>
      </form>
    </Drawer>
  );
}
