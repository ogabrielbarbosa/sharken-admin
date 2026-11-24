'use client';

import { BATCH_SOURCE_LABEL, buildInstagramQueries, cityName, DEFAULT_CRITERIA, formatMunicipio, municipioGeo, MAX_NETWORK_PROFILES, municipiosNear, profileHandle, prospectedCities, RELATION_LABEL, relationsLabel, type BatchSource, type Place, type ProfileRelation, type SiteRequirement, type WorldCity } from '@lps/domain';
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Plus, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { ProspectMap } from '@/components/map/prospect-map';
import { createBatchAction, suggestManyVariantsAction, worldCitiesNearAction } from '@/app/painel/batches/actions';
import { Button, Drawer, ErrorNote, Field, Input, LinkButton, Select } from '@/components/ui';
import { CityPicker } from './city-picker';

const criteriaFields = [
  { key: 'minReviews', label: 'Mínimo de avaliações' },
  { key: 'minRating', label: 'Nota mínima' },
  { key: 'minPhotos', label: 'Mínimo de fotos' },
  { key: 'instagramActiveDays', label: 'Instagram ativo nos últimos', suffix: 'dias' },
  { key: 'recontactDays', label: 'Não recontatar antes de', suffix: 'dias' },
] as const;

const SITE_LABEL: Record<SiteRequirement, string> = { qualquer: 'Tanto faz', sem_site: 'Só quem não tem site', com_site: 'Só quem tem site' };
const SOURCE_HINT: Record<BatchSource, string> = { instagram: 'Perfis achados pela busca do Google', maps: 'Lugares do Google Maps', instagram_profile: 'Seguidores e seguindo de um perfil' };
const RELATIONS: ProfileRelation[] = ['following', 'followers'];
const COUNTRIES = ['BR', 'US', 'PT', 'CA', 'GB', 'ES', 'FR', 'IT', 'DE', 'AR', 'MX', 'AU'].map((value) => ({ value, label: new Intl.DisplayNames('pt-BR', { type: 'region' }).of(value) ?? value }));

type Variants = { options: string[]; chosen: string[]; saved: boolean };
export type ProspectedRow = { id: string; location: string; locations: string[]; places?: Place[]; business_type: string; created_at: string; leads: number };
const RADII = [0, 15, 30, 50, 80];

export function NewBatchDrawer({ apifyConnected, prospected = [], closeHref = '/painel/batches' }: { apifyConnected: boolean; closeHref?: string; prospected?: ProspectedRow[] }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<BatchSource>('instagram');
  // Cidades escolhidas na lista; com raio, entram também as vizinhas da primeira (dá para tirar uma a uma).
  const [picked, setPicked] = useState<string[]>([]);
  const [radius, setRadius] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [cityPlaces, setCityPlaces] = useState<Record<string, Place>>({});
  const [worldNear, setWorldNear] = useState<{ key: string; cities: (WorldCity & { km: number })[] }>({ key: '', cities: [] });
  const [pickerKey, setPickerKey] = useState(0);
  const [where, setWhere] = useState({ name: '', businessType: '', quantity: '50' });
  const [criteria, setCriteria] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(DEFAULT_CRITERIA).map(([k, v]) => [k, String(v)])),
  );
  const [network, setNetwork] = useState({ profile: '', relations: ['following'] as ProfileRelation[], country: 'BR' });
  const [marks, setMarks] = useState({ requireInstagramActive: true, requirePhone: false, requireContact: false, site: 'qualquer' as SiteRequirement });
  const [niche, setNiche] = useState<Variants | null>(null);
  const [places, setPlaces] = useState<Record<string, Variants>>({});
  const [loading, startLoading] = useTransition();

  const center = picked[0] ?? null;
  // País do batch: o da primeira cidade. Sem lugar conhecido, é município do Brasil.
  const byProfile = source === 'instagram_profile';
  const handle = profileHandle(network.profile);
  const perList = Math.floor(MAX_NETWORK_PROFILES / Math.max(network.relations.length, 1));
  const country = (center && cityPlaces[center]?.country) || 'BR';
  const abroad = country !== 'BR';
  const nearKey = `${center}:${radius}`;
  useEffect(() => {
    if (!center || !abroad || !radius) return;
    let live = true;
    worldCitiesNearAction(center, radius)
      .then((cities) => live && setWorldNear({ key: nearKey, cities }))
      .catch(() => live && setError('Não foi possível buscar as cidades em volta.'));
    return () => { live = false; };
  }, [center, abroad, radius, nearKey]);
  const loadingNear = abroad && radius > 0 && worldNear.key !== nearKey;
  const nearby = useMemo(() => {
    if (!center) return [];
    if (abroad) return radius && worldNear.key === nearKey ? worldNear.cities.map((c) => ({ location: c.location, name: c.name, km: c.km })) : [];
    return municipiosNear(center, radius).map((m) => ({ location: formatMunicipio(m), name: m.nome, km: m.km }));
  }, [center, radius, abroad, worldNear, nearKey]);
  const geoOf = (l: string) => cityPlaces[l] ?? worldNear.cities.find((c) => c.location === l) ?? municipioGeo(l);
  const locations = [...new Set([...picked, ...nearby.map((m) => m.location).filter((l) => !skipped.includes(l))])];
  const done = useMemo(() => {
    const leads = Object.fromEntries(prospected.map((p) => [p.id, p.leads]));
    return prospectedCities(prospected, leads, where.businessType.trim() || undefined);
  }, [prospected, where.businessType]);
  const centerGeo = center ? geoOf(center) : null;
  const selection = centerGeo ? { center: centerGeo, radiusKm: radius, cities: locations.flatMap((l) => { const g = geoOf(l); return g ? [{ location: l, lat: g.lat, lng: g.lng }] : []; }) } : undefined;

  // No Maps fora do Brasil também há variações: o nicho vai no idioma de lá.
  const steps = byProfile ? ['Onde buscar', 'Critérios', 'Confirmar'] : source === 'instagram' || abroad ? ['Onde buscar', 'Variações', 'Critérios', 'Confirmar'] : ['Onde buscar', 'Critérios', 'Confirmar'];
  const current = steps[step];
  const last = step === steps.length - 1;
  const nicheTerms = steps.includes('Variações') ? niche?.chosen ?? [] : [];
  const locationTerms = [...new Set(Object.entries(places).filter(([l]) => source === 'instagram' && locations.includes(l)).map(([, p]) => p).flatMap((p) => p.chosen))];
  const queries = buildInstagramQueries(nicheTerms, locationTerms);

  const variantCities = source === 'instagram' ? locations : [];
  const termOf = (l: string) => (abroad ? l.toLowerCase() : cityName(l));

  function addCity(l: string, place?: Place) {
    setPickerKey(pickerKey + 1);
    if (picked.includes(l)) return;
    if (center && (place?.country ?? 'BR') !== country) return setError('Escolha cidades de um país só por batch.');
    setError(null);
    if (place) setCityPlaces({ ...cityPlaces, [l]: place });
    setPicked([...picked, l]);
  }

  function loadVariants() {
    startLoading(async () => {
      const [n, ...ps] = await suggestManyVariantsAction([
        { kind: 'nicho', term: where.businessType },
        ...variantCities.map((l) => ({ kind: 'local' as const, term: termOf(l) })),
      ], country);
      setNiche({ options: n.variants, chosen: n.variants, saved: n.saved });
      setPlaces(Object.fromEntries(variantCities.map((l, i) => [l, { options: ps[i].variants, chosen: ps[i].variants, saved: ps[i].saved }])));
    });
  }

  function next() {
    if (current === 'Onde buscar' && byProfile) {
      if (!handle) return setError('Cole o link de um perfil do Instagram.');
      if (!network.relations.length) return setError('Escolha seguindo, seguidores ou os dois.');
      if (!(Number(where.quantity) > 0 && Number(where.quantity) <= perList)) return setError(`Informe uma quantidade entre 1 e ${perList}.`);
    } else if (current === 'Onde buscar') {
      if (!locations.length) return setError('Escolha pelo menos uma cidade na lista.');
      if (!where.businessType.trim()) return setError('Preencha o tipo de negócio.');
      if (!(Number(where.quantity) > 0)) return setError('Informe uma quantidade maior que zero.');
      if (loadingNear) return setError('Espere as cidades em volta carregarem.');
      if (source === 'instagram' || abroad) loadVariants();
    }
    if (current === 'Variações' && (!nicheTerms.length || (source === 'instagram' && !locationTerms.length))) {
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
      <Drawer title="Novo batch" closeHref={closeHref}>
        <div className="flex flex-col gap-4">
          <ErrorNote>Conecte sua conta do Apify em Configurações › Apify.</ErrorNote>
          <p className="text-sm text-muted-foreground">A busca no Google Maps e no Instagram roda na conta do Apify deste workspace. A conta gratuita traz US$ 5 de crédito por mês, uns 7 batches de 50 lugares.</p>
          <LinkButton href="/painel/configuracoes?aba=apify">Conectar o Apify</LinkButton>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer title="Novo batch" subtitle={`Passo ${step + 1} de ${steps.length}`} closeHref={closeHref}>
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
            <Field label="Nome do batch (opcional)" hint="Sem nome, vale o tipo de negócio e o lugar, ou o @ do perfil.">
              <Input value={where.name} maxLength={80} onChange={(e) => setWhere({ ...where, name: e.target.value })} />
            </Field>
            <Field label="Fonte">
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(['instagram', 'maps', 'instagram_profile'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={source === s}
                    onClick={() => { setSource(s); setStep(0); setError(null); setMarks({ ...marks, requireInstagramActive: s !== 'instagram_profile' }); setWhere({ ...where, quantity: s === 'instagram_profile' ? '250' : '50' }); }}
                    className={`press cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition-colors ${source === s ? 'border-brand bg-brand-muted/40 font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {BATCH_SOURCE_LABEL[s]}
                    <span className="block text-xs font-normal text-muted-foreground">{SOURCE_HINT[s]}</span>
                  </button>
                ))}
              </div>
            </Field>
            {byProfile ? (
              <>
                <Field label="Perfil do Instagram" hint="O link ou o @. O perfil precisa ser público.">
                  <Input value={network.profile} placeholder="https://www.instagram.com/perfil/" onChange={(e) => setNetwork({ ...network, profile: e.target.value })} />
                </Field>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">O que puxar</legend>
                  {RELATIONS.map((r) => (
                    <Check2 key={r} label={RELATION_LABEL[r]} checked={network.relations.includes(r)} onChange={(v) => setNetwork({ ...network, relations: RELATIONS.filter((x) => (x === r ? v : network.relations.includes(x))) })} />
                  ))}
                </fieldset>
                <Field label="Máximo de perfis por lista" hint={`Até ${perList}. Custa uns US$ 5 no Apify a cada 1.000 perfis (a lista e a leitura de cada um).`}>
                  <Input type="number" min={1} max={perList} value={where.quantity} onChange={(e) => setWhere({ ...where, quantity: e.target.value })} />
                </Field>
                <Field label="País dos perfis" hint="Para ler os telefones da bio.">
                  <Select value={network.country} onValueChange={(c) => setNetwork({ ...network, country: c })} options={COUNTRIES} />
                </Field>
                <Field label="Tipo de negócio (opcional)" hint="Vale para quem não informa a categoria no perfil.">
                  <Input value={where.businessType} onChange={(e) => setWhere({ ...where, businessType: e.target.value })} />
                </Field>
              </>
            ) : (<>
            <p className="text-xs text-muted-foreground">Depois dá para rodar a outra fonte em cima do mesmo batch: os resultados cruzam com os leads que já estão nele.</p>
            <Field label="Cidades" hint="Do Brasil ou de qualquer país (um país por batch). Com raio, as cidades em volta da primeira entram junto.">
              <div className="flex flex-col gap-2">
                <CityPicker key={pickerKey} onPick={addCity} />
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
                            {m.name} <span className="text-muted-foreground">{Math.round(m.km)} km</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {loadingNear && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Buscando as cidades em volta…</p>}
                {locations.length > 0 && <p className="text-xs text-muted-foreground">{locations.length} {locations.length === 1 ? 'cidade' : 'cidades'} no batch.</p>}
                <ProspectMap cities={done} selection={selection} height={220} onPick={(l) => addCity(l, prospected.flatMap((p) => p.places ?? []).find((p) => p.location === l))} />
                <p className="text-xs text-muted-foreground">Os círculos claros são cidades onde {where.businessType.trim() ? `"${where.businessType.trim()}"` : 'algum nicho'} já foi buscado. Clique num para acrescentar. Cidades de fora do Brasil: GeoNames (CC BY 4.0).</p>
              </div>
            </Field>
            <Field label="Tipo de negócio" hint={source === 'instagram' ? 'Do jeito que vier à cabeça: no próximo passo aparecem as variações que os negócios usam.' : 'Como alguém buscaria no Google Maps.'}>
              <Input value={where.businessType} placeholder={source === 'instagram' ? 'lente dental' : 'dentista'} onChange={(e) => setWhere({ ...where, businessType: e.target.value })} />
            </Field>
            <Field label="Quantidade de leads" hint="Padrão: 50 leads por batch."><Input type="number" min={1} value={where.quantity} onChange={(e) => setWhere({ ...where, quantity: e.target.value })} /></Field>
            </>)}
          </div>
        )}
        {current === 'Variações' && (
          <div key="variants" className="stagger flex flex-col gap-5">
            {loading || !niche ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Buscando as variações…</p>
            ) : (
              <>
                <VariantList title={`Nicho · ${where.businessType}`} value={niche} onChange={setNiche} />
                {variantCities.map((l) => places[l] && (
                  <VariantList key={l} title={`Localização · ${cityName(l)}`} value={places[l]} onChange={(v) => setPlaces({ ...places, [l]: v })} />
                ))}
                {source === 'instagram' && <div className="flex flex-col gap-1.5">
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
                </div>}
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
              {byProfile && <Check2 label="Tem celular ou e-mail" checked={marks.requireContact} onChange={(v) => setMarks({ ...marks, requireContact: v })} />}
              <Field label="Site">
                <Select value={marks.site} onValueChange={(site) => setMarks({ ...marks, site: site as SiteRequirement })} options={(Object.keys(SITE_LABEL) as SiteRequirement[]).map((s) => ({ value: s, label: SITE_LABEL[s] }))} />
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
              {where.name.trim() && <Row label="Nome" value={where.name.trim()} />}
              <Row label="Fonte" value={BATCH_SOURCE_LABEL[source]} />
              {byProfile ? (
                <>
                  <Row label="Perfil" value={`@${handle}`} />
                  <Row label="Puxar" value={relationsLabel(network.relations)} />
                  <Row label="País" value={COUNTRIES.find((c) => c.value === network.country)!.label} />
                </>
              ) : <Row label="Cidades" value={locations.join(' + ')} />}
              {(!byProfile || where.businessType.trim()) && <Row label="Tipo de negócio" value={where.businessType} />}
              <Row label={byProfile ? 'Máximo por lista' : 'Quantidade de leads'} value={where.quantity} />
              {source === 'instagram' && <Row label="Variações" value={`${nicheTerms.length} do nicho, ${locationTerms.length} da localização`} />}
            </dl>
            <dl className="space-y-2 rounded-lg border border-border p-4">
              <Row label="Instagram ativo" value={marks.requireInstagramActive ? 'Exige' : 'Não exige'} />
              <Row label="Celular" value={marks.requirePhone ? 'Exige' : 'Não exige'} />
              {byProfile && <Row label="Celular ou e-mail" value={marks.requireContact ? 'Exige' : 'Não exige'} />}
              <Row label="Site" value={SITE_LABEL[marks.site]} />
              {criteriaFields.map((f) => <Row key={f.key} label={f.label} value={`${criteria[f.key]}${'suffix' in f ? ` ${f.suffix}` : ''}`} />)}
            </dl>
            <p className="text-xs text-muted-foreground">A busca roda em segundo plano. Você acompanha o andamento na lista de batches.</p>
            <input type="hidden" name="name" value={where.name} />
            <input type="hidden" name="source" value={source} />
            {byProfile && <><input type="hidden" name="profile" value={handle ?? ''} /><input type="hidden" name="country" value={network.country} /><input type="hidden" name="requireContact" value={String(marks.requireContact)} />{network.relations.map((r) => <input key={r} type="hidden" name="relation" value={r} />)}</>}
            {locations.map((l) => <input key={l} type="hidden" name="location" value={l} />)}
            <input type="hidden" name="businessType" value={where.businessType} />
            <input type="hidden" name="quantity" value={where.quantity} />
            {nicheTerms.map((t) => <input key={`n-${t}`} type="hidden" name="nicheTerm" value={t} />)}
            <input type="hidden" name="placeTerms" value={JSON.stringify(Object.fromEntries(Object.entries(places).filter(([l]) => variantCities.includes(l)).map(([l, v]) => [termOf(l), v.chosen])))} />
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
