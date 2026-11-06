import { X } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-white',
  secondary: 'bg-secondary text-foreground hover:bg-neutral-700',
  outline: 'border border-input bg-input-bg text-foreground hover:bg-accent',
  ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  danger: 'text-destructive hover:bg-destructive-subtle',
};
const buttonBase =
  'inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4';

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
  'w-full rounded-md border border-input bg-input-bg px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-neutral-400';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, 'h-9', props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, 'py-2', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, 'h-9 [&>option]:bg-card', props.className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-card border border-border bg-card', className)}>{children}</section>;
}

export type Tone = 'neutral' | 'success' | 'danger' | 'warning';
const tones: Record<Tone, string> = {
  neutral: 'bg-secondary text-foreground',
  success: 'bg-success-subtle text-success-foreground',
  danger: 'bg-destructive-subtle text-destructive',
  warning: 'bg-warning-subtle text-warning',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium [&_svg]:size-3', tones[tone])}>{children}</span>;
}

const dots: Record<Tone, string> = { neutral: 'bg-neutral-500', success: 'bg-success', danger: 'bg-destructive', warning: 'bg-warning' };
export function Status({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span className={cx('size-1.5 rounded-full', dots[tone])} />
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, actions }: { icon?: ReactNode; title: string; description?: string; actions?: ReactNode }) {
  return (
    <Card className="flex min-h-96 flex-col items-center justify-center gap-3 p-8 text-center">
      {icon && <span className="rounded-full bg-secondary p-3 [&_svg]:size-5">{icon}</span>}
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </Card>
  );
}

export function Drawer({ title, subtitle, closeHref, children }: { title: string; subtitle?: string; closeHref: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Fechar" className="absolute inset-0 bg-black/60" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <Link href={closeHref} scroll={false} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></Link>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">{children}</p>;
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
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
