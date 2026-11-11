'use client';

import { PROCESS_STEPS, type ProcessStep } from '@lps/domain';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';

export function Stepper({ batchId, counts, current }: { batchId: string; counts: Record<ProcessStep, number>; current?: ProcessStep }) {
  const pathname = usePathname();
  const active = current ?? PROCESS_STEPS.find((s) => pathname.endsWith(`/${s.key}`))?.key;
  const activeIndex = PROCESS_STEPS.findIndex((s) => s.key === active);
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2.5 lg:px-6">
      {PROCESS_STEPS.map((s, i) => {
        const on = s.key === active;
        const done = activeIndex > -1 && i < activeIndex;
        return (
          <Fragment key={s.key}>
            {i > 0 && <ChevronRight className={`size-3.5 shrink-0 transition-colors ${done || on ? 'text-brand-soft/70' : 'text-subtle-foreground'}`} />}
            <Link
              href={`/painel/batches/${batchId}/${s.key}`}
              aria-current={on ? 'step' : undefined}
              className={`press flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-sm ${
                on
                  ? 'bg-linear-to-b from-brand-bright to-brand font-medium text-white shadow-brand'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              }`}
            >
              {s.label}
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums transition-colors ${
                  on ? 'bg-white/20 text-white' : counts[s.key] > 0 ? 'bg-brand-muted text-brand-light' : 'bg-white/[0.06] text-muted-foreground'
                }`}
              >
                {counts[s.key]}
              </span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
