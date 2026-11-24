'use client';

import { Loader2, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button, Drawer, ErrorNote, Field, Input, Select, Textarea, type SelectOption } from '@/components/ui';
import { createLeadAction } from '@/lib/common-lead-actions';

/** Cadastro de um lead: basta um link (Google, Instagram ou site) ou o nome. O Google e o site preenchem o resto. */
export function NewLeadDrawer({ closeHref, batches, apifyConnected }: { closeHref: string; batches: SelectOption[]; apifyConnected: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Drawer title="Novo lead" subtitle="Cole um link: o sistema preenche o resto" closeHref={closeHref}>
      {/* onSubmit (e não action) para não limpar os campos quando volta um erro. */}
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setError(null);
          start(async () => { const out = await createLeadAction(form); if (out?.error) setError(out.error); });
        }}
      >
        <Field label="Google Meu Negócio" hint={apifyConnected ? 'Link do Google Maps (Compartilhar › Copiar link). Puxa nome, telefone, endereço, nota e fotos.' : 'Para puxar os dados, conecte o Apify em Configurações.'}>
          <Input name="maps_url" inputMode="url" placeholder="https://maps.app.goo.gl/…" autoFocus />
        </Field>
        <Field label="Site" hint="O sistema lê a página e preenche o que encontrar."><Input name="website_url" inputMode="url" placeholder="clinica.com.br" /></Field>
        <Field label="Instagram" hint="Só fica guardado. É lido quando o lead vira Qualificado ou pelo botão da ficha."><Input name="instagram_url" placeholder="@perfil ou link" /></Field>
        <Field label="Batch"><Select name="batch" defaultValue="sem" options={[{ value: 'sem', label: 'Sem batch' }, ...batches]} /></Field>
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Preencher à mão (opcional)</summary>
          <div className="flex flex-col gap-4 border-t border-border p-4">
            <Field label="Nome"><Input name="name" /></Field>
            <Field label="Tipo de negócio"><Input name="business_type" /></Field>
            <Field label="Celular / WhatsApp"><Input name="phone" inputMode="tel" placeholder="(12) 99999-9999 ou +1 512…" /></Field>
            <Field label="E-mail"><Input name="email" inputMode="email" /></Field>
            <Field label="Cidade"><Input name="city" /></Field>
            <Field label="Endereço"><Input name="address" /></Field>
            <Field label="Sobre o negócio"><Textarea name="description" rows={3} /></Field>
          </div>
        </details>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto flex justify-end pt-4"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}Adicionar lead</Button></div>
      </form>
    </Drawer>
  );
}
