'use client';

import { CYCLES, formatBRL } from '@lps/domain';
import { useState } from 'react';
import type { CatalogOption } from '@/components/crm/close-deal-drawer';
import { Field, Input, Select, Textarea } from '@/components/ui';

/** Campos do Novo serviço. Escolher do catálogo preenche nome, tipo, valor e observações; dá para ajustar. */
export function ServiceFields({ catalog }: { catalog: CatalogOption[] }) {
  const [v, setV] = useState({ catalogId: '', name: '', kind: 'unico', amount: '', notes: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const pick = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    setV((s) => (item ? { catalogId: id, name: item.name, kind: item.kind, amount: formatBRL(item.amount_cents), notes: item.description ?? s.notes } : { ...s, catalogId: id }));
  };
  return (
    <>
      {catalog.length > 0 && (
        <Field label="Do catálogo">
          <Select value={v.catalogId} onChange={(e) => pick(e.target.value)}>
            <option value="">Escolha um serviço ou preencha abaixo</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatBRL(c.amount_cents)}{c.kind === 'recorrente' ? ` · ${CYCLES.find((x) => x.value === c.cycle)?.label.toLowerCase() ?? 'recorrente'}` : ''}</option>)}
          </Select>
        </Field>
      )}
      <input type="hidden" name="cycle" value={catalog.find((c) => c.id === v.catalogId)?.cycle ?? ''} />
      <Field label="Nome do serviço"><Input name="name" value={v.name} onChange={set('name')} required /></Field>
      <Field label="Tipo"><Select name="kind" value={v.kind} onChange={set('kind')}><option value="unico">Único</option><option value="recorrente">Recorrente</option></Select></Field>
      <Field label="Valor"><Input name="amount" value={v.amount} onChange={set('amount')} placeholder="R$ 450,00" required /></Field>
      <Field label="Data de início"><Input name="start_date" type="date" required /></Field>
      <Field label="Observações"><Textarea name="notes" rows={3} value={v.notes} onChange={set('notes')} placeholder="Escopo, prazos ou combinados com o cliente." /></Field>
    </>
  );
}
