import type { FunnelStep } from '@lps/domain';

const FLOW_COLORS = ['var(--color-chart-1)', 'var(--color-chart-2)'];

/** Barras finas por dia. Cada barra mostra o valor ao passar o mouse. */
export function DailyBars({ days, series }: { days: { label: string; values: number[] }[]; series: string[] }) {
  const max = Math.max(1, ...days.map((d) => d.values.reduce((a, b) => a + b, 0)));
  const height = 160;
  return (
    <div>
      <div className="flex h-40 items-end gap-1" role="img" aria-label={`Gráfico de barras: ${series.join(' e ')} por dia`}>
        {days.map((d) => {
          const total = d.values.reduce((a, b) => a + b, 0);
          return (
            <div key={d.label} className="group relative flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-0.5" title={`${d.label}: ${d.values.map((v, i) => `${series[i]} ${v}`).join(', ')}`}>
              {d.values.map((v, i) => v > 0 && (
                <span key={i} className="w-full max-w-3 rounded-t" style={{ height: (v / max) * height, background: FLOW_COLORS[i] }} />
              ))}
              {total === 0 && <span className="h-px w-full max-w-3 bg-chart-grid" />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{days[0]?.label}</span>
        <span>{days[Math.floor(days.length / 2)]?.label}</span>
        <span>{days.at(-1)?.label}</span>
      </div>
      {series.length > 1 && <Legend items={series} />}
    </div>
  );
}

export function Legend({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((label, i) => (
        <span key={label} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: FLOW_COLORS[i] }} />{label}</span>
      ))}
    </div>
  );
}

export function Donut({ parts, total, unit }: { parts: { label: string; value: number }[]; total: number; unit: string }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 150 150" className="size-40" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        <circle cx="75" cy="75" r={radius} fill="none" stroke="var(--color-chart-grid)" strokeWidth="10" />
        {total > 0 && parts.map((p, i) => {
          const length = (p.value / total) * circumference;
          const el = (
            <circle key={p.label} cx="75" cy="75" r={radius} fill="none" stroke={FLOW_COLORS[i]} strokeWidth="10" strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 75 75)">
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
          );
          offset += length;
          return el;
        })}
        <text x="75" y="74" textAnchor="middle" fill="var(--color-foreground)" fontSize="24" fontWeight="600">{total}</text>
        <text x="75" y="92" textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="11">{unit}</text>
      </svg>
      <div className="mt-3 w-full space-y-1 text-sm">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: FLOW_COLORS[i] }} />{p.label}</span>
            <span className="text-muted-foreground">{p.value} · {total ? Math.round((p.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[8rem_1fr_3rem_3rem] items-center gap-3 text-sm">
          <span className="truncate">{s.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${(s.count / max) * 100}%` }} /></span>
          <span className="text-right font-medium">{s.count}</span>
          <span className="text-right text-xs text-muted-foreground">{s.rate === null ? '—' : `${s.rate}%`}</span>
        </li>
      ))}
    </ol>
  );
}
