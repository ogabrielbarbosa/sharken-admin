'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/** Linha de tabela com um chevron que abre uma segunda linha (os serviços do cliente). */
export function ExpandableRow({ cells, details, colSpan, label }: { cells: ReactNode; details: ReactNode; colSpan: number; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td className="w-10 py-3 pl-3 pr-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${open ? 'Esconder' : 'Ver'} serviços de ${label}`}
            className="press grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ChevronDown className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </td>
        {cells}
      </tr>
      {open && (
        <tr className="bg-white/[0.015]">
          <td colSpan={colSpan} className="px-4 pb-4 pt-1">{details}</td>
        </tr>
      )}
    </>
  );
}
