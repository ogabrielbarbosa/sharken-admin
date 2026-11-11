'use client';

import { formatMunicipio, searchMunicipios, type Municipio } from '@lps/domain';
import { Check, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';

/** Campo de cidade que só aceita um município da lista do IBGE. `value` fica vazio até a escolha. */
export function MunicipioPicker({ value, onChange }: { value: string; onChange: (location: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(() => (value && text === value ? [] : searchMunicipios(text)), [text, value]);

  function choose(m: Municipio) {
    const label = formatMunicipio(m);
    setText(label);
    onChange(label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={text}
        placeholder="Digite a cidade e escolha na lista"
        role="combobox"
        aria-expanded={open && options.length > 0}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange('');
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % options.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + options.length) % options.length); }
          if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
        }}
      />
      {value && <Check className="pointer-events-none absolute top-2.5 right-3 size-4 text-emerald-500" />}
      {open && options.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg">
          {options.map((m, i) => (
            <li
              key={formatMunicipio(m)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(m); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? 'bg-secondary' : ''}`}
            >
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              <span>{m.nome}</span>
              <span className="ml-auto text-xs text-muted-foreground">{m.estado}</span>
            </li>
          ))}
        </ul>
      )}
      {open && text.trim().length > 1 && !value && options.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Nenhum município com esse nome.</p>
      )}
    </div>
  );
}
