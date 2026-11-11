'use client';

import { DEFAULT_CRITERIA, findMunicipio } from '@lps/domain';
import { ArrowLeft, ArrowRight, Check, Search } from 'lucide-react';
import { useState } from 'react';
import { createBatchAction } from '@/app/painel/batches/actions';
import { Button, Drawer, ErrorNote, Field, Input } from '@/components/ui';
import { MunicipioPicker } from './municipio-picker';

const STEPS = ['Onde buscar', 'Critérios', 'Confirmar'];

const criteriaFields = [
  { key: 'minReviews', label: 'Mínimo de avaliações' },
  { key: 'minRating', label: 'Nota mínima' },
  { key: 'minPhotos', label: 'Mínimo de fotos' },
  { key: 'instagramActiveDays', label: 'Instagram ativo nos últimos', suffix: 'dias' },
  { key: 'recontactDays', label: 'Não recontatar antes de', suffix: 'dias' },
] as const;

export function NewBatchDrawer() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [where, setWhere] = useState({ location: '', businessType: '', quantity: '50' });
  const [criteria, setCriteria] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(DEFAULT_CRITERIA).map(([k, v]) => [k, String(v)])),
  );

  function next() {
    if (step === 0) {
      if (!findMunicipio(where.location)) return setError('Escolha a cidade na lista de municípios.');
      if (!where.businessType.trim()) return setError('Preencha o tipo de negócio.');
      if (!(Number(where.quantity) > 0)) return setError('Informe uma quantidade maior que zero.');
    }
    if (step === 1 && Object.values(criteria).some((v) => v === '' || !(Number(v.replace(',', '.')) >= 0))) {
      return setError('Preencha todos os critérios com números.');
    }
    setError(null);
    setStep(step + 1);
  }

  return (
    <Drawer title="Novo batch" subtitle={`Passo ${step + 1} de 3`} closeHref="/painel/batches">
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-1.5 ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>
            <span className={`flex size-5 items-center justify-center rounded-full ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
              {i < step ? <Check className="size-3" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <form action={createBatchAction} className="flex flex-1 flex-col gap-4">
        {step === 0 && (
          <>
            <p className="text-sm text-muted-foreground">Escolha a cidade na lista e escreva o tipo de negócio como alguém buscaria no Google Maps.</p>
            <Field label="Cidade"><MunicipioPicker value={where.location} onChange={(location) => setWhere((w) => ({ ...w, location }))} /></Field>
            <Field label="Tipo de negócio"><Input value={where.businessType} placeholder="pet shop" onChange={(e) => setWhere({ ...where, businessType: e.target.value })} /></Field>
            <Field label="Quantidade de leads" hint="Padrão: 50 leads por batch."><Input type="number" min={1} value={where.quantity} onChange={(e) => setWhere({ ...where, quantity: e.target.value })} /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">Definem quais negócios entram na revisão. Os valores abaixo são o padrão e valem só para este batch.</p>
            {criteriaFields.map((f) => (
              <Field key={f.key} label={f.label + ('suffix' in f ? ` (${f.suffix})` : '')}>
                <Input value={criteria[f.key]} inputMode="decimal" onChange={(e) => setCriteria({ ...criteria, [f.key]: e.target.value })} />
              </Field>
            ))}
          </>
        )}
        {step === 2 && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Revise o batch antes de iniciar a busca.</p>
            <dl className="space-y-2 rounded-lg border border-border p-4">
              <Row label="Localização" value={where.location} />
              <Row label="Tipo de negócio" value={where.businessType} />
              <Row label="Quantidade de leads" value={where.quantity} />
            </dl>
            <dl className="space-y-2 rounded-lg border border-border p-4">
              {criteriaFields.map((f) => <Row key={f.key} label={f.label} value={`${criteria[f.key]}${'suffix' in f ? ` ${f.suffix}` : ''}`} />)}
            </dl>
            <p className="text-xs text-muted-foreground">A busca roda em segundo plano. Você acompanha o andamento na lista de batches.</p>
          </div>
        )}
        {step === 2 && (
          <>
            <input type="hidden" name="location" value={where.location} />
            <input type="hidden" name="businessType" value={where.businessType} />
            <input type="hidden" name="quantity" value={where.quantity} />
            {Object.entries(criteria).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto flex justify-between gap-2 pt-4">
          {step > 0 ? <Button variant="outline" onClick={() => { setError(null); setStep(step - 1); }}><ArrowLeft />Voltar</Button> : <span />}
          {step < 2 ? <Button onClick={next}>Continuar<ArrowRight /></Button> : <Button type="submit"><Search />Buscar leads</Button>}
        </div>
      </form>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
