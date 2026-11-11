import type { ReactNode } from 'react';

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 py-3">
      <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground [&_svg]:size-3.5">{icon}{title}</h3>
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
