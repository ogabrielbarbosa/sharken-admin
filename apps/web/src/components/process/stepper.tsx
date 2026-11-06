'use client';

import { PROCESS_STEPS, type ProcessStep } from '@lps/domain';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

export function Stepper({ batchId, counts, current }: { batchId: string; counts: Record<ProcessStep, number>; current?: ProcessStep }) {
  const pathname = usePathname();
  const active = current ?? PROCESS_STEPS.find((s) => pathname.endsWith(`/${s.key}`))?.key;
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-3 lg:px-6">
      {PROCESS_STEPS.map((s, i) => {
        const on = s.key === active;
        return (
          <Fragment key={s.key}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
            <Link
              href={`/painel/batches/${batchId}/${s.key}`}
              className={`flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm ${on ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {s.label}
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${on ? 'bg-neutral-300' : 'bg-secondary text-foreground'}`}>{counts[s.key]}</span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
