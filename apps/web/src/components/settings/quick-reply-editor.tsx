'use client';

import { fillVariables, normalizeShortcut, QUICK_REPLY_LIMITS, unknownVariables } from '@lps/domain';
import { CheckCheck, Loader2, TriangleAlert, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { saveQuickReplyAction, type QuickReplyResult } from '@/app/painel/configuracoes/actions';
import { Button, ErrorNote, Field, Input, Textarea } from '@/components/ui';

export type QuickReplyDraft = { id: string | null; shortcut: string; title: string; body: string };

/** Negrito, itálico e riscado do WhatsApp, como aparecem no celular. */
function whatsAppFormat(text: string): ReactNode {
  return text.split(/((?<![\w*])\*[^*\n]+\*(?![\w*])|(?<![\w_/])_[^_\n]+_(?![\w_/])|(?<![\w~])~[^~\n]+~(?![\w~]))/).map((part, i) => {
    const inner = part.slice(1, -1);
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{inner}</strong>;
    if (i % 2 && part.startsWith('_')) return <em key={i}>{inner}</em>;
    if (i % 2 && part.startsWith('~')) return <s key={i}>{inner}</s>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function QuickReplyEditor({ draft, variables, taken, onClose, onSaved }: {
  draft: QuickReplyDraft;
  variables: { key: string; label: string; value: string }[];
  /** Atalhos das outras mensagens. */
  taken: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [shortcut, setShortcut] = useState(draft.shortcut);
  // Em mensagem nova, o atalho acompanha o título até ser editado à mão.
  const [auto, setAuto] = useState(!draft.shortcut);
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  const dirty = title !== draft.title || shortcut !== draft.shortcut || body !== draft.body;
  const clash = taken.includes(normalizeShortcut(shortcut));
  const unknown = unknownVariables(body);
  const ready = !!title.trim() && !!normalizeShortcut(shortcut) && !!body.trim() && !clash;

  function close() {
    if (pending) return;
    if (dirty) setConfirming(true);
    else onClose();
  }
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function insert(value: string) {
    const el = area.current;
    const from = el?.selectionStart ?? body.length;
    const to = el?.selectionEnd ?? from;
    setBody(body.slice(0, from) + value + body.slice(to));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(from + value.length, from + value.length); });
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || pending) return;
    setError(null);
    start(async () => {
      let out: QuickReplyResult;
      try { out = await saveQuickReplyAction(draft.id, { title, shortcut, body }); } catch { out = { ok: false, error: 'Não foi possível salvar. Confira a conexão e tente de novo.' }; }
      if (out.ok) onSaved(out.message);
      else setError(out.error);
    });
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="mensagem-rapida-titulo" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" tabIndex={-1} aria-label="Fechar" onClick={close} className="absolute inset-0 animate-overlay-in cursor-default bg-black/60 backdrop-blur-[2px]" />
      <form onSubmit={submit} className="relative flex max-h-full w-full max-w-4xl animate-pop-in flex-col overflow-hidden rounded-card border border-border bg-card shadow-overlay">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="mensagem-rapida-titulo" className="font-semibold">{draft.id ? 'Editar mensagem' : 'Nova mensagem rápida'}</h2>
          <button type="button" aria-label="Fechar" onClick={close} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="grid min-h-0 overflow-y-auto md:grid-cols-[1fr_20rem]">
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
              <Field label="Título">
                <Input autoFocus value={title} maxLength={QUICK_REPLY_LIMITS.title} placeholder="Ex.: Confirmar reunião" onChange={(e) => { setTitle(e.target.value); if (auto) setShortcut(normalizeShortcut(e.target.value)); }} />
              </Field>
              <Field label="Atalho">
                <span className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">/</span>
                  <Input aria-label="Atalho" aria-invalid={clash} value={shortcut} placeholder="reuniao" className="font-mono" style={{ paddingLeft: '1.5rem' }} onChange={(e) => { setAuto(false); setShortcut(normalizeShortcut(e.target.value, true)); }} />
                </span>
              </Field>
            </div>
            {clash && <p className="text-xs text-destructive">Já existe uma mensagem com o atalho /{normalizeShortcut(shortcut)}.</p>}

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="mensagem-rapida-texto" className="text-sm font-medium">Mensagem</label>
                <span className="text-xs tabular-nums text-subtle-foreground">{body.length}/{QUICK_REPLY_LIMITS.body}</span>
              </div>
              <Textarea
                id="mensagem-rapida-texto"
                ref={area}
                rows={8}
                value={body}
                maxLength={QUICK_REPLY_LIMITS.body}
                placeholder="Oi, $primeiro_nome! …"
                className="resize-y leading-relaxed"
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
              />
              {unknown.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" />
                  {unknown.map((k) => `$${k}`).join(', ')} não é uma variável conhecida e vai aparecer assim na mensagem.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Clique para inserir um dado do contato</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button key={v.key} type="button" data-tip={`$${v.key}`} onClick={() => insert(`$${v.key}`)} className="press cursor-pointer rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground outline-none hover:border-brand-border-strong hover:bg-brand-muted hover:text-brand-light focus-visible:ring-2 focus-visible:ring-ring/60">
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col border-border bg-background/60 p-5 max-md:border-t md:border-l">
            <p className="text-xs font-medium text-muted-foreground">Como o contato recebe</p>
            <div className="flex flex-1 flex-col justify-end pt-4">
              <div className="ml-auto max-w-full rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm text-white">
                {body.trim()
                  ? <p className="whitespace-pre-wrap break-words">{whatsAppFormat(fillVariables(body.trim(), variables))}</p>
                  : <p className="text-white/60">A prévia aparece aqui.</p>}
                <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/70">14:32<CheckCheck className="size-3.5" /></p>
              </div>
            </div>
            <p className="mt-4 text-xs text-subtle-foreground">Contato de exemplo. Se faltar um dado no contato, a variável fica no texto para você completar antes de enviar.</p>
          </div>
        </div>

        {error && <div className="px-5 pb-4"><ErrorNote>{error}</ErrorNote></div>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/40 px-5 py-3">
          {confirming ? (
            <>
              <span className="mr-auto text-sm text-warning">Descartar o que você escreveu?</span>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Continuar editando</Button>
              <Button variant="danger" onClick={onClose}>Descartar</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>Cancelar</Button>
              <Button type="submit" disabled={!ready || pending}>{pending && <Loader2 className="animate-spin" />}{pending ? 'Salvando…' : draft.id ? 'Salvar' : 'Criar mensagem'}</Button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
