import { X } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary:
    'bg-linear-to-b from-brand-bright to-brand text-brand-foreground shadow-brand hover:brightness-110 hover:shadow-[0_10px_30px_-8px_#3b82f6cc,inset_0_1px_0_#ffffff40]',
  secondary: 'bg-secondary text-foreground hover:bg-accent',
  outline: 'border border-input bg-input-bg text-foreground hover:border-border-strong hover:bg-white/5',
  ghost: 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
  danger: 'text-destructive hover:bg-destructive-subtle',
};
const buttonBase =
  'press inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0';

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={cx(buttonBase, variants[variant], className)} />;
}

export function LinkButton({ href, variant = 'primary', className, children, external }: {
  href: string; variant?: Variant; className?: string; children: ReactNode; external?: boolean;
}) {
  const classes = cx(buttonBase, variants[variant], className);
  if (external) return <a href={href} target="_blank" rel="noreferrer" className={classes}>{children}</a>;
  return <Link href={href} className={classes}>{children}</Link>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputBase =
  'rounded-md border border-input bg-input-bg px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-subtle-foreground hover:border-border-strong focus:border-brand-bright focus:bg-brand-muted/40 focus:ring-3 focus:ring-brand-bright/20';

/** Largura cheia, a não ser que a tela peça outra (`w-48`, etc.). */
const width = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full');

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, width(props.className), 'h-9', props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, width(props.className), 'py-2', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, width(props.className), 'h-9 cursor-pointer [&>option]:bg-card', props.className)} />;
}

export function Card({ className, children, interactive }: { className?: string; children: ReactNode; interactive?: boolean }) {
  return (
    <section className={cx('rounded-card border border-border bg-card', interactive && 'glow-card', className)}>
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'brand';
const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-foreground/90',
  success: 'bg-success-subtle text-success-foreground',
  danger: 'bg-destructive-subtle text-destructive',
  warning: 'bg-warning-subtle text-warning',
  brand: 'bg-brand-muted text-brand-light ring-1 ring-inset ring-brand-border',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3', tones[tone])}>{children}</span>;
}

const dots: Record<Tone, string> = { neutral: 'bg-zinc-500', success: 'bg-success', danger: 'bg-destructive', warning: 'bg-warning', brand: 'bg-brand-bright' };
const glows: Record<Tone, string> = { neutral: '', success: 'shadow-[0_0_8px_#10b981]', danger: 'shadow-[0_0_8px_#ff6467]', warning: 'shadow-[0_0_8px_#f59e0b]', brand: 'shadow-[0_0_8px_#3b82f6]' };
export function Status({ tone = 'neutral', children, live }: { tone?: Tone; children: ReactNode; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span className="relative flex size-1.5">
        {live && <span className={cx('absolute inset-0 animate-ping rounded-full opacity-75', dots[tone])} />}
        <span className={cx('relative size-1.5 rounded-full', dots[tone], glows[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Linha de ações da tela. O título fica só na barra do topo. */
export function Toolbar({ children, start }: { children?: ReactNode; start?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div>
      {children && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

/** Título de seção com contagem. */
export function SectionTitle({ children, count, tone }: { children: ReactNode; count?: number; tone?: Tone }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
      {children}
      {count !== undefined && <Badge tone={tone}>{count}</Badge>}
    </h2>
  );
}

export function EmptyState({ icon, title, description, actions }: { icon?: ReactNode; title: string; description?: string; actions?: ReactNode }) {
  return (
    <Card className="relative flex min-h-96 flex-col items-center justify-center gap-3 overflow-hidden p-8 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-texture opacity-50 mask-[radial-gradient(50%_60%_at_50%_45%,black,transparent)]" />
      {icon && (
        <span className="relative grid size-12 place-items-center rounded-xl border border-brand-border bg-linear-to-b from-brand-bright/25 to-brand/10 text-brand-light shadow-[0_8px_24px_-8px_#3b82f6] [&_svg]:size-5">
          {icon}
        </span>
      )}
      <h2 className="relative font-semibold">{title}</h2>
      {description && <p className="relative max-w-md text-sm text-muted-foreground">{description}</p>}
      {actions && <div className="relative mt-2 flex gap-2">{actions}</div>}
    </Card>
  );
}

export function Drawer({ title, subtitle, closeHref, children, wide }: { title: string; subtitle?: string; closeHref: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Fechar" className="absolute inset-0 animate-overlay-in bg-black/60 backdrop-blur-[2px]" />
      <aside className={cx('relative flex h-full w-full animate-drawer-in flex-col overflow-x-hidden overflow-y-auto border-l border-border bg-card p-6 shadow-overlay', wide ? 'max-w-xl' : 'max-w-md')}>
        <div className="relative mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Link href={closeHref} scroll={false} aria-label="Fechar" className="grid size-8 place-items-center rounded-md text-muted-foreground transition-[color,background-color,rotate] duration-200 hover:rotate-90 hover:bg-white/5 hover:text-foreground"><X className="size-4" /></Link>
        </div>
        <div className="relative flex flex-1 flex-col">{children}</div>
      </aside>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="animate-fade-in rounded-md border border-destructive/20 bg-destructive-subtle px-3 py-2 text-sm text-destructive">{children}</p>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h, i) => <th key={i} className="px-4 py-2.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border [&>tr]:transition-colors [&>tr]:duration-200 [&>tr:hover]:bg-white/[0.025]">{children}</tbody>
      </table>
    </div>
  );
}
