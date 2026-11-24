'use client';

import { formatMunicipio, searchMunicipios, type WorldCity } from '@lps/domain';
import { Globe, MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { searchWorldCitiesAction } from '@/app/painel/batches/actions';
import { Input } from '@/components/ui';

type Option = { location: string; name: string; detail: string; place?: WorldCity };

/** Campo de cidade: municípios do IBGE na hora e as do resto do mundo pelo servidor. Só aceita o que está na lista. */
export function CityPicker({ onPick }: { onPick: (location: string, place?: WorldCity) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [world, setWorld] = useState<{ query: string; cities: WorldCity[]; failed?: boolean }>({ query: '', cities: [] });
  const query = text.trim();

  useEffect(() => {
    if (query.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchWorldCitiesAction(query)
        .then((cities) => live && setWorld({ query, cities }))
        .catch(() => live && setWorld({ query, cities: [], failed: true }));
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  const options = useMemo<Option[]>(() => {
    const br = searchMunicipios(query, 5).map((m) => ({ location: formatMunicipio(m), name: m.nome, detail: `${m.estado}, Brasil` }));
    const abroad = world.query === query ? world.cities.map((c) => ({ location: c.location, name: c.name, detail: [c.region, c.countryName].filter(Boolean).join(', '), place: c })) : [];
    return [...br, ...abroad];
  }, [query, world]);
  const searching = query.length >= 2 && world.query !== query;
  const current = Math.min(active, options.length - 1);

  return (
    <div className="relative">
      <Input
        value={text}
        placeholder="Cidade de qualquer país: Campinas, Austin TX, Lisboa…"
        role="combobox"
        aria-expanded={open && options.length > 0}
        autoComplete="off"
        onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
          if (!options.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((current + 1) % options.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((current - 1 + options.length) % options.length); }
          if (e.key === 'Enter') onPick(options[current].location, options[current].place);
        }}
      />
      {open && options.length > 0 && (
        <ul role="listbox" className="absolute z-[1100] mt-1 max-h-72 w-full origin-top animate-pop-in overflow-auto rounded-md border border-border bg-card py-1 shadow-overlay">
          {options.map((o, i) => (
            <li
              key={o.location}
              role="option"
              aria-selected={i === current}
              onMouseDown={(e) => { e.preventDefault(); onPick(o.location, o.place); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === current ? 'bg-brand-bright/15 text-brand-pale' : ''}`}
            >
              {o.place ? <Globe className="size-3.5 shrink-0 text-muted-foreground" /> : <MapPin className="size-3.5 shrink-0 text-muted-foreground" />}
              <span>{o.name}</span>
              <span className="ml-auto text-right text-xs text-muted-foreground">{o.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query.length > 1 && options.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{searching ? 'Procurando…' : world.failed ? 'Não foi possível buscar as cidades de fora do Brasil.' : 'Nenhuma cidade com esse nome.'}</p>
      )}
    </div>
  );
}
