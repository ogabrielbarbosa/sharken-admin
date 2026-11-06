import type { ClientDraft } from '@lps/domain';
import { Button, Drawer, ErrorNote, Field, Input } from '@/components/ui';

export function ClientDrawer({ title, subtitle, closeHref, draft, action, submitLabel, error, clientId }: {
  title: string; subtitle?: string; closeHref: string; draft: Partial<ClientDraft>; action: (form: FormData) => Promise<void>; submitLabel: string; error?: string; clientId?: string;
}) {
  return (
    <Drawer title={title} subtitle={subtitle} closeHref={closeHref}>
      <form action={action} className="flex flex-1 flex-col gap-4">
        {draft.lead_id && <p className="text-sm text-muted-foreground">Preenchido com os dados do lead. Confira e complete o que faltar antes de salvar.</p>}
        <input type="hidden" name="leadId" value={draft.lead_id ?? ''} />
        <input type="hidden" name="location" value={draft.location ?? ''} />
        <input type="hidden" name="closeHref" value={closeHref} />
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <Field label="Nome ou razão social"><Input name="legal_name" defaultValue={draft.legal_name} required /></Field>
        <Field label="CPF/CNPJ"><Input name="document" defaultValue={draft.document} placeholder="00.000.000/0000-00" required /></Field>
        <Field label="Responsável"><Input name="contact_name" defaultValue={draft.contact_name} placeholder="Nome de quem assina" /></Field>
        <Field label="E-mail"><Input name="email" type="email" defaultValue={draft.email} placeholder="email@exemplo.com.br" /></Field>
        <Field label="Telefone"><Input name="phone" defaultValue={draft.phone} /></Field>
        <Field label="Endereço"><Input name="address" defaultValue={draft.address} /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto pt-4"><Button type="submit" className="w-full">{submitLabel}</Button></div>
      </form>
    </Drawer>
  );
}
