'use client';

import { Popover } from '@base-ui/react/popover';
import type { LeadField } from '@lps/domain';
import { Ban, Check, ExternalLink, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';
import { Button, ErrorNote, Input, Select, type SelectOption } from '@/components/ui';
import { blockLeadAction, removeLeadFromBatchAction, saveLeadFieldsAction, setLeadBatchAction } from '@/lib/common-lead-actions';
import { cx } from '@/components/ui/cx';

/** Texto que vira campo ao clicar. Enter ou sair do campo salva; Esc desfaz. */
export function InlineEdit({ leadId, field, value, label, display, className, inputClassName, multiline }: {
  leadId: string; field: LeadField; value: string | null; label: string; display?: ReactNode; className?: string; inputClassName?: string; multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cancel = () => { setDraft(null); setError(null); };
  const save = () => {
    if (draft === null || pending) return;
    if (draft.trim() === (value ?? '')) return cancel();
    setError(null);
    start(async () => {
      const out = await saveLeadFieldsAction(leadId, field, draft);
      if (out.error) setError(out.error);
      else setDraft(null);
    });
  };

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label={`Editar ${label.toLowerCase()}`}
        onClick={() => setDraft(value ?? '')}
        className={cx('group/edit -mx-1.5 flex min-w-0 max-w-full cursor-text items-center gap-2 rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring/60', className)}
      >
        <span className={cx('min-w-0 [overflow-wrap:anywhere]', !value && 'text-muted-foreground')}>{display ?? value ?? 'Adicionar'}</span>
        <Pencil aria-hidden className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" />
      </button>
    );
  }
  const props = {
    autoFocus: true,
    'aria-label': label,
    value: draft,
    disabled: pending,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); save(); }
    },
    className: cx('w-full min-w-0 rounded-md border border-brand-bright bg-input-bg px-1.5 py-0.5 outline-none', inputClassName),
  };
  return (
    <span className="block w-full min-w-0">
      {multiline ? <textarea rows={3} {...props} /> : <input {...props} />}
      {error && <span role="alert" className="mt-1 block text-xs font-normal tracking-normal text-destructive">{error}</span>}
    </span>
  );
}

/** Quadradinho de um link do lead: clicar abre; passar o mouse mostra o link e o editar. Vazio, o clique já edita. */
export function LinkSquare({ leadId, field, label, href, text, icon, placeholder, hint }: {
  leadId: string; field: LeadField; label: string; href: string | null; text: string | null; icon: ReactNode; placeholder: string; hint: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = draft !== null;

  const save = (value: string) => start(async () => {
    setError(null);
    const out = await saveLeadFieldsAction(leadId, field, value);
    if (out.error) return setError(out.error);
    setDraft(null);
    setOpen(false);
  });

  const box = 'flex size-9 cursor-pointer items-center justify-center rounded-md border border-border bg-input-bg text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-popup-open:border-brand-bright [&_svg]:size-4';
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        // Editando, só sai por clique fora, Esc ou salvar: tirar o mouse não fecha.
        if (!next && editing && details.reason === 'trigger-hover') return;
        // Clicar no link abre o link, e o popover fica como está.
        if (details.reason === 'trigger-press' && href) return;
        setOpen(next);
        if (next && !href) setDraft((d) => d ?? '');
        if (!next) { setDraft(null); setError(null); }
      }}
    >
      {href
        ? <Popover.Trigger nativeButton={false} openOnHover delay={120} closeDelay={150} aria-label={label} render={<a href={href} target="_blank" rel="noreferrer" />} className={box}>{icon}</Popover.Trigger>
        : <Popover.Trigger openOnHover delay={120} closeDelay={150} aria-label={`Adicionar ${label}`} className={cx(box, 'border-dashed opacity-60 hover:opacity-100')}>{icon}</Popover.Trigger>}
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="center" className="z-[1100]">
          <Popover.Popup initialFocus={false} aria-label={label} className="w-72 origin-(--transform-origin) rounded-md border border-border-strong bg-card p-3 text-sm text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-150 ease-(--ease-out-expo) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{label}</p>
              {!editing && (
                <span className="flex gap-1">
                  {href && <a href={href} target="_blank" rel="noreferrer" aria-label="Abrir" data-tip="Abrir" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"><ExternalLink className="size-3.5" /></a>}
                  <button type="button" aria-label={`Editar ${label}`} data-tip="Editar" onClick={() => setDraft(text ?? '')} className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"><Pencil className="size-3.5" /></button>
                </span>
              )}
            </div>
            {editing ? (
              <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
                <Input autoFocus aria-label={label} value={draft} disabled={pending} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
                <p className="text-xs text-muted-foreground">{hint}</p>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" aria-label="Cancelar" onClick={() => { setDraft(null); setError(null); if (!href) setOpen(false); }}><X /></Button>
                  <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />}Salvar</Button>
                </div>
              </form>
            ) : <p className="mt-1 truncate text-xs text-muted-foreground">{text ?? 'Aberto pela ficha do Google'}</p>}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Batch do lead: trocar ou tirar, na mesma etapa. Os outros batches em que ele foi achado dá para remover um a um. */
export function LeadBatchField({ leadId, current, options, others }: { leadId: string; current: string | null; options: SelectOption[]; others: SelectOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { setError((await fn()).error ?? null); });
  return (
    <div className="w-full min-w-0 space-y-1.5">
      <Select size="sm" aria-label="Batch" disabled={pending} value={current ?? 'sem'} onValueChange={(v) => run(() => setLeadBatchAction(leadId, v))} options={[{ value: 'sem', label: 'Sem batch' }, ...options]} />
      {others.map((b) => (
        <p key={b.value} className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Também em {b.label}</span>
          <button type="button" disabled={pending} aria-label={`Tirar de ${b.label}`} data-tip="Tirar deste batch" onClick={() => run(() => removeLeadFromBatchAction(leadId, b.value))} className="grid size-5 shrink-0 cursor-pointer place-items-center rounded hover:bg-white/10 hover:text-foreground"><X className="size-3" /></button>
        </p>
      ))}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Não contatar vale para o negócio todo e não tem volta: pede confirmação. */
export function BlockLeadButton({ leadId }: { leadId: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label="Não contatar" data-tip="Não contatar" className="press grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"><Ban className="size-4" /></Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-[1100]">
          <Popover.Popup aria-label="Confirmar não contatar" className="w-64 origin-(--transform-origin) space-y-3 rounded-md border border-border-strong bg-card p-3 text-sm text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <p>Marcar como não contatar? Vale para o negócio todo e não dá para desfazer.</p>
            <form action={blockLeadAction} className="flex justify-end gap-1">
              <input type="hidden" name="leadId" value={leadId} />
              <Popover.Close render={<Button variant="ghost" />}>Cancelar</Popover.Close>
              <Button type="submit" variant="danger">Não contatar</Button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
