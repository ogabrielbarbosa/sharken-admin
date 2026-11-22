'use client';

import { buildInstagramQueries, DEFAULT_CRITERIA, findMunicipio, formatMunicipio, municipioGeo, municipiosNear, prospectedCities, type BatchSource, type SiteRequirement } from '@lps/domain';
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Plus, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { ProspectMap } from '@/components/map/prospect-map';
import { createBatchAction, suggestManyVariantsAction } from '@/app/painel/batches/actions';
import { Button, Drawer, ErrorNote, Field, Input, LinkButton, Select } from '@/components/ui';
import { MunicipioPicker } from './municipio-picker';

const criteriaFields = [
  { key: 'minReviews', label: 'Mínimo de avaliações' },
  { key: 'minRating', label: 'Nota mínima' },
  { key: 'minPhotos', label: 'Mínimo de fotos' },
  { key: 'instagramActiveDays', label: 'Instagram ativo nos últimos', suffix: 'dias' },
  { key: 'recontactDays', label: 'Não recontatar antes de', suffix: 'dias' },
] as const;

const SITE_LABEL: Record<SiteRequirement, string> = { qualquer: 'Tanto faz', sem_site: 'Só quem não tem site', com_site: 'Só quem tem site' };
const SOURCE_LABEL: Record<BatchSource, string> = { instagram: 'Instagram', maps: 'Google Maps' };

type Variants = { options: string[]; chosen: string[]; saved: boolean };
export type ProspectedRow = { id: string; location: string; locations: string[]; business_type: string; created_at: string; leads: number };
const RADII = [0, 15, 30, 50, 80];
const cityName = (location: string) => findMunicipio(location)?.nome ?? location.split(',')[0];

export function NewBatchDrawer({ apifyConnected, prospected = [] }: { apifyConnected: boolean; prospected?: ProspectedRow[] }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<BatchSource>('instagram');
  // Cidades escolhidas na lista; com raio, entram também as vizinhas da primeira (dá para tirar uma a uma).
  const [picked, setPicked] = useState<string[]>([]);
  const [radius, setRadius] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [where, setWhere] = useState({ businessType: '', quantity: '50' });
  const [criteria, setCriteria] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(DEFAULT_CRITERIA).map(([k, v]) => [k, String(v)])),
  );
  const [marks, setMarks] = useState({ requireInstagramActive: true, requirePhone: false, site: 'qualquer' as SiteRequirement });
  const [niche, setNiche] = useState<Variants | null>(null);
  const [places, setPlaces] = useState<Record<string, Variants>>({});
  const [loading, startLoading] = useTransition();

  const center = picked[0] ?? null;
  const nearby = useMemo(() => (center ? municipiosNear(center, radius).map((m) => ({ ...m, location: formatMunicipio(m) })) : []), [center, radius]);
  const locations = [...new Set([...picked, ...nearby.map((m) => m.location).filter((l) => !skipped.includes(l))])];
  const done = useMemo(() => {
    const leads = Object.fromEntries(prospected.map((p) => [p.id, p.leads]));
    return prospectedCities(prospected, leads, where.businessType.trim() || undefined);
  }, [prospected, where.businessType]);
  const centerGeo = center ? municipioGeo(center) : null;
  const selection = centerGeo ? { center: centerGeo, radiusKm: radius, cities: locations.flatMap((l) => { const g = municipioGeo(l); return g ? [{ location: l, lat: g.lat, lng: g.lng }] : []; }) } : undefined;

  const steps = source === 'instagram' ? ['Onde buscar', 'Variações', 'Critérios', 'Confirmar'] : ['Onde buscar', 'Critérios', 'Confirmar'];
  const current = steps[step];
  const last = step === steps.length - 1;
  const nicheTerms = niche?.chosen ?? [];
  const locationTerms = [...new Set(Object.values(places).flatMap((p) => p.chosen))];
  const queries = buildInstagramQueries(nicheTerms, locationTerms);

  function loadVariants() {
    startLoading(async () => {
      const [n, ...ps] = await suggestManyVariantsAction([
        { kind: 'nicho', term: where.businessType },
        ...locations.map((l) => ({ kind: 'local' as const, term: cityName(l) })),
      ]);
      setNiche({ options: n.variants, chosen: n.variants, saved: n.saved });
      setPlaces(Object.fromEntries(locations.map((l, i) => [l, { options: ps[i].variants, chosen: ps[i].variants, saved: ps[i].saved }])));
    });
  }

  function next() {
    if (current === 'Onde buscar') {
      if (!locations.length) return setError('Escolha pelo menos uma cidade na lista de municípios.');
      if (!where.businessType.trim()) return setError('Preencha o nicho.');
      if (!(Number(where.quantity) > 0)) return setError('Informe uma quantidade maior que zero.');
      if (source === 'instagram') loadVariants();
    }
    if (current === 'Variações' && (!nicheTerms.length || !locationTerms.length)) {
      return setError('Deixe marcada pelo menos uma variação do nicho e uma da localização.');
    }
    if (current === 'Critérios' && Object.values(criteria).some((v) => v === '' || !(Number(v.replace(',', '.')) >= 0))) {
      return setError('Preencha todos os critérios com números.');
    }
    setError(null);
    setStep(step + 1);
  }

  if (!apifyConnected) {
    return (
      <Drawer title="Novo batch" closeHref="/painel/batches">
        <div className="flex flex-col gap-4">
          <ErrorNote>Conecte sua conta do Apify em Configurações › Apify.</ErrorNote>
          <p className="text-sm text-muted-foreground">A busca no Google Maps e no Instagram roda na conta do Apify deste workspace. A conta gratuita traz US$ 5 de crédito por mês, uns 7 batches de 50 lugares.</p>
          <LinkButton href="/painel/configuracoes?aba=apify">Conectar o Apify</LinkButton>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer title="Novo batch" subtitle={`Passo ${step + 1} de ${steps.length}`} closeHref="/painel/batches">
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {steps.map((label, i) => (
          <li key={label} className={`flex items-center gap-1.5 transition-colors duration-300 ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>
            <span className={`flex size-5 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-300 ${i <= step ? 'bg-brand text-white shadow-[0_0_10px_-2px_#1f88c0]' : 'bg-white/[0.06]'}`}>
              {i < step ? <Check className="size-3 animate-check-pop" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <form action={createBatchAction} className="flex flex-1 flex-col gap-4">
        {current === 'Onde buscar' && (
          <div key="where" className="stagger flex flex-col gap-4">
            <Field label="Fonte">
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {(['instagram', 'maps'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={source === s}
                    onClick={() => { setSource(s); setStep(0); }}
                    className={`press cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors ${source === s ? 'border-brand bg-brand-muted/40 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {SOURCE_LABEL[s]}
                    <span className="block text-xs font-normal text-muted-foreground">{s === 'instagram' ? 'Perfis achados pela busca do Google' : 'Lugares do Google Maps'}</span>
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">Depois dá para rodar a outra fonte em cima do mesmo batch: os resultados cruzam com os leads que já estão nele.</p>
            <Field label="Cidades" hint="Escolha na lista. Com raio, as cidades em volta da primeira entram junto.">
              <div className="flex flex-col gap-2">
                <MunicipioPicker key={pickerKey} value="" onChange={(l) => { if (l && !picked.includes(l)) setPicked([...picked, l]); if (l) setPickerKey(pickerKey + 1); }} />
                {center && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Raio em volta de {cityName(center)}:</span>
                    {RADII.map((r) => (
                      <button key={r} type="button" aria-pressed={radius === r} onClick={() => { setRadius(r); setSkipped([]); }} className={`press cursor-pointer rounded-full border px-2.5 py-0.5 ${radius === r ? 'border-brand bg-brand-muted/50' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {r ? `${r} km` : 'Só as escolhidas'}
                      </button>
                    ))}
                  </div>
                )}
                {(picked.length > 0 || nearby.length > 0) && (
                  <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {picked.map((l) => (
                      <li key={l} className="flex items-center gap-1 rounded-full border border-brand bg-brand-muted/40 py-0.5 pr-1 pl-2.5 text-xs">
                        <MapPin className="size-3 text-muted-foreground" />{l}
                        <button type="button" aria-label={`Tirar ${l}`} onClick={() => setPicked(picked.filter((x) => x !== l))} className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"><X className="size-3" /></button>
                      </li>
                    ))}
                    {nearby.map((m) => {
                      const on = !skipped.includes(m.location);
                      return (
                        <li key={m.location}>
                          <button type="button" aria-pressed={on} onClick={() => setSkipped(on ? [...skipped, m.location] : skipped.filter((x) => x !== m.location))} className={`press cursor-pointer rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-border bg-white/[0.04]' : 'border-border text-muted-foreground line-through'}`}>
                            {m.nome} <span className="text-muted-foreground">{Math.round(m.km)} km</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {locations.length > 0 && <p className="text-xs text-muted-foreground">{locations.length} {locations.length === 1 ? 'cidade' : 'cidades'} no batch.</p>}
                <ProspectMap cities={done} selection={selection} height={220} onPick={(l) => { if (!picked.includes(l)) setPicked([...picked, l]); }} />
                <p className="text-xs text-muted-foreground">Os círculos claros são cidades onde {where.businessType.trim() ? `"${where.businessType.trim()}"` : 'algum nicho'} já foi buscado. Clique num para acrescentar.</p>
              </div>
            </Field>
            <Field label="Nicho" hint={source === 'instagram' ? 'Do jeito que vier à cabeça: no próximo passo aparecem as variações que os negócios usam.' : 'Como alguém buscaria no Google Maps.'}>
              <Input value={where.businessType} placeholder={source === 'instagram' ? 'lente dental' : 'dentista'} onChange={(e) => setWhere({ ...where, businessType: e.target.value })} />
            </Field>
            <Field label="Quantidade de leads" hint="Padrão: 50 leads por batch."><Input type="number" min={1} value={where.quantity} onChange={(e) => setWhere({ ...where, quantity: e.target.value })} /></Field>
          </div>
        )}
        {current === 'Variações' && (
          <div key="variants" className="stagger flex flex-col gap-5">
            {loading || !niche ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Buscando as variações…</p>
            ) : (
              <>
                <VariantList title={`Nicho · ${where.businessType}`} value={niche} onChange={setNiche} />
                {locations.map((l) => places[l] && (
                  <VariantList key={l} title={`Localização · ${cityName(l)}`} value={places[l]} onChange={(v) => setPlaces({ ...places, [l]: v })} />
                ))}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Busca no Google: {queries.length} {queries.length === 1 ? 'consulta' : 'consultas'}
                    {queries.length > 3 && ' (cada consulta gasta crédito do Apify; tirar variações diminui)'}
                  </span>
                  {queries[0] && <code className="block rounded-md border border-border bg-white/[0.03] p-2 font-mono text-[11px] leading-relaxed break-words text-muted-foreground">{queries[0]}</code>}
                  {queries.length > 1 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">Ver as outras {queries.length - 1}</summary>
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {queries.slice(1).map((q) => <code key={q} className="block rounded-md border border-border bg-white/[0.03] p-2 font-mono text-[11px] leading-relaxed break-words">{q}</code>)}
                      </div>
                    </details>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {current === 'Critérios' && (
          <div key="criteria" className="stagger flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">As marcações tiram do batch quem não atende (vai para Descartados). Os números só dão pontuação.</p>
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <Check2 label={`Postou no Instagram nos últimos ${criteria.instagramActiveDays || '…'} dias`} checked={marks.requireInstagramActive} onChange={(v) => setMarks({ ...marks, requireInstagramActive: v })} />
              <Check2 label="Tem celular" checked={marks.requirePhone} onChange={(v) => setMarks({ ...marks, requirePhone: v })} />
              <Field label="Site">
                <Select value={marks.site} onChange={(e) => setMarks({ ...marks, site: e.target.value as SiteRequirement })}>
                  {(Object.keys(SITE_LABEL) as SiteRequirement[]).map((s) => <option key={s} value={s}>{SITE_LABEL[s]}</option>)}
                </Select>
              </Field>
            </div>
            {criteriaFields.map((f) => (
              <Field key={f.key} label={f.label + ('suffix' in f ? ` (${f.suffix})` : '')}>
                <Input value={criteria[f.key]} inputMode="decimal" onChange={(e) => setCriteria({ ...criteria, [f.key]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
        {current === 'Confirmar' && (
          <div key="confirm" className="stagger space-y-4 text-sm">
            <p className="text-muted-foreground">Revise o batch antes de iniciar a busca.</p>
            <dl className="space-y-2 rounded-lg border border-brand-border bg-brand-muted/40 p-4">
              <Row label="Fonte" value={SOURCE_LABEL[source]} />
              <Row label="Cidades" value={locations.join(' + ')} />
              <Row label="Nicho" value={where.businessType} />
              <Row label="Quantidade de leads" value={where.quantity} />
              {source === 'instagram' && <Row label="Variações" value={`${nicheTerms.length} do nicho, ${locationTerms.length} da localização`} />}
            </dl>
            <dl className="space-y-2 rounded-lg border border-border p-4">
              <Row label="Instagram ativo" value={marks.requireInstagramActive ? 'Exige' : 'Não exige'} />
              <Row label="Celular" value={marks.requirePhone ? 'Exige' : 'Não exige'} />
              <Row label="Site" value={SITE_LABEL[marks.site]} />
              {criteriaFields.map((f) => <Row key={f.key} label={f.label} value={`${criteria[f.key]}${'suffix' in f ? ` ${f.suffix}` : ''}`} />)}
            </dl>
            <p className="text-xs text-muted-foreground">A busca roda em segundo plano. Você acompanha o andamento na lista de batches.</p>
            <input type="hidden" name="source" value={source} />
            {locations.map((l) => <input key={l} type="hidden" name="location" value={l} />)}
            <input type="hidden" name="businessType" value={where.businessType} />
            <input type="hidden" name="quantity" value={where.quantity} />
            {nicheTerms.map((t) => <input key={`n-${t}`} type="hidden" name="nicheTerm" value={t} />)}
            <input type="hidden" name="placeTerms" value={JSON.stringify(Object.fromEntries(Object.entries(places).map(([l, v]) => [cityName(l), v.chosen])))} />
            {Object.entries(criteria).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="hidden" name="requireInstagramActive" value={String(marks.requireInstagramActive)} />
            <input type="hidden" name="requirePhone" value={String(marks.requirePhone)} />
            <input type="hidden" name="site" value={marks.site} />
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="mt-auto flex justify-between gap-2 pt-4">
          {step > 0 ? <Button variant="outline" onClick={() => { setError(null); setStep(step - 1); }}><ArrowLeft />Voltar</Button> : <span />}
          {!last ? <Button onClick={next} disabled={loading && current === 'Variações'}>Continuar<ArrowRight /></Button> : <Button type="submit"><Search />Buscar leads</Button>}
        </div>
      </form>
    </Drawer>
  );
}

/** Variações sugeridas (salvas ou do Claude), para marcar, tirar e acrescentar. */
function VariantList({ title, value, onChange }: { title: string; value: Variants; onChange: (v: Variants) => void }) {
  const [extra, setExtra] = useState('');
  const toggle = (t: string) => onChange({ ...value, chosen: value.chosen.includes(t) ? value.chosen.filter((x) => x !== t) : [...value.chosen, t] });
  const add = () => {
    const t = extra.trim().toLowerCase();
    if (t && !value.options.includes(t)) onChange({ ...value, options: [...value.options, t], chosen: [...value.chosen, t] });
    setExtra('');
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
        {title}
        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">{value.saved ? <><Check className="size-3" />salvas antes</> : <><Sparkles className="size-3" />sugeridas pelo Claude</>}</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {value.options.map((t) => {
          const on = value.chosen.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)} className={`press cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-brand bg-brand-muted/50 text-foreground' : 'border-border text-muted-foreground line-through hover:text-foreground'}`}>
              {t}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input value={extra} placeholder="Acrescentar variação" onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button variant="outline" onClick={add} aria-label="Acrescentar"><Plus /></Button>
      </div>
    </fieldset>
  );
}

function Check2({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer accent-[#1f88c0]" />
      {label}
    </label>
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
