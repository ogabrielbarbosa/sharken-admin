'use client';

import { fillVariables, matchesQuickReply } from '@lps/domain';
import { ArrowDown, ArrowUp, Copy, GripVertical, MessageSquareText, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteQuickReplyAction, reorderQuickRepliesAction, restoreQuickRepliesAction, toggleQuickReplyAction, type QuickReplyResult,
} from '@/app/painel/configuracoes/actions';
import { Badge, Button, Card, cx, EmptyState, ErrorNote, Input } from '@/components/ui';
import { QuickReplyEditor, type QuickReplyDraft } from './quick-reply-editor';

export type QuickReplyRow = { id: string; shortcut: string; title: string; body: string; position: number; active: boolean };
export type PreviewVariable = { key: string; label: string; value: string };

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:size-4',
        danger ? 'hover:bg-destructive-subtle hover:text-destructive' : 'hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Texto com as $variáveis destacadas. */
function BodyText({ text, keys }: { text: string; keys: string[] }) {
  return (
    <>
      {text.split(/(\$[a-z_]+)/).map((part, i) =>
        part.startsWith('$') && keys.includes(part.slice(1))
          ? <span key={i} className="rounded bg-brand-muted px-1 font-mono text-[0.9em] text-brand-light">{part}</span>
          : part)}
    </>
  );
}

export function QuickRepliesManager({ items, variables, canEdit }: { items: QuickReplyRow[]; variables: PreviewVariable[]; canEdit: boolean }) {
  const [list, setList] = useState(items);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<QuickReplyDraft | null>(null);
  const [deleting, setDeleting] = useState<QuickReplyRow | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // O servidor é a verdade: cada gravação revalida a página e traz a lista nova.
  useEffect(() => setList(items), [items]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!deleting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeleting(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting]);

  /** Mostra a mudança na hora e volta atrás se o servidor recusar. */
  function run(action: () => Promise<QuickReplyResult>, optimistic?: QuickReplyRow[], quiet = false) {
    setError(null);
    setNotice(null);
    const before = list;
    if (optimistic) setList(optimistic);
    start(async () => {
      let out: QuickReplyResult;
      try { out = await action(); } catch { out = { ok: false, error: 'Não foi possível salvar. Confira a conexão e tente de novo.' }; }
      if (!out.ok) { if (optimistic) setList(before); setError(out.error); }
      else if (!quiet) setNotice(out.message);
    });
  }

  function move(id: string, to: number) {
    const from = list.findIndex((r) => r.id === id);
    if (pending || from < 0 || to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    run(() => reorderQuickRepliesAction(next.map((r) => r.id)), next, true);
  }

  function duplicate(r: QuickReplyRow) {
    let n = 2;
    const base = r.shortcut.slice(0, 26);
    while (list.some((x) => x.shortcut === `${base}-${n}`)) n++;
    setDraft({ id: null, shortcut: `${base}-${n}`, title: `${r.title} (cópia)`.slice(0, 60), body: r.body });
  }

  const keys = variables.map((v) => v.key);
  const shown = list.filter((r) => matchesQuickReply({ ...r, text: r.body }, query));
  const canSort = canEdit && !query.trim() && list.length > 1;
  const newDraft = () => setDraft({ id: null, shortcut: '', title: '', body: '' });
  const restore = () => run(restoreQuickRepliesAction);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-medium">Mensagens rápidas</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            No atendimento, digite <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">/</kbd> e o atalho para inserir o texto já com os dados do contato.
          </p>
        </div>
        {canEdit
          ? <Button onClick={newDraft}><Plus />Nova mensagem</Button>
          : <span className="text-xs text-muted-foreground">Só o dono pode alterar.</span>}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <div aria-live="polite">{notice && <p className="animate-fade-in rounded-md border border-success/40 px-3 py-2 text-sm text-success">{notice}</p>}</div>

      {list.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText />}
          title="Nenhuma mensagem rápida"
          description="Crie textos prontos para o que você mais repete no atendimento, ou comece pelas mensagens padrão."
          actions={canEdit ? <><Button variant="outline" disabled={pending} onClick={restore}><RotateCcw />Usar as padrão</Button><Button onClick={newDraft}><Plus />Criar mensagem</Button></> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border p-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Buscar mensagem" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título, atalho ou texto" style={{ paddingLeft: '2.25rem' }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{query.trim() ? `${shown.length} de ${list.length}` : `${list.length} ${list.length === 1 ? 'mensagem' : 'mensagens'}`}</span>
          </div>

          <ul className="divide-y divide-border">
            {shown.map((r) => {
              const index = list.indexOf(r);
              return (
                <li
                  key={r.id}
                  draggable={canSort}
                  onDragStart={(e) => { setDragging(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => { if (dragging) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, index); setDragging(null); }}
                  className={cx('group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025]', dragging === r.id && 'opacity-40', dragging && dragging !== r.id && 'hover:bg-brand-muted')}
                >
                  {canSort && <GripVertical aria-hidden className="mt-1 size-4 shrink-0 cursor-grab text-subtle-foreground max-sm:hidden" />}
                  <div className={cx('min-w-0 flex-1', !r.active && 'opacity-50')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-brand-border bg-brand-muted px-1.5 py-0.5 font-mono text-xs text-brand-light">/{r.shortcut}</span>
                      <span className="min-w-0 truncate text-sm font-medium">{r.title}</span>
                      {!r.active && <Badge>Desativada</Badge>}
                    </div>
                    <p className="mt-1.5 line-clamp-2 whitespace-pre-line break-words text-sm text-muted-foreground"><BodyText text={r.body} keys={keys} /></p>
                    {canEdit && (
                      <div className="-ml-2 mt-1.5 flex flex-wrap items-center">
                        <IconButton label={`Editar ${r.title}`} onClick={() => setDraft({ id: r.id, shortcut: r.shortcut, title: r.title, body: r.body })}><Pencil /></IconButton>
                        <IconButton label={`Duplicar ${r.title}`} onClick={() => duplicate(r)}><Copy /></IconButton>
                        {canSort && <IconButton label={`Subir ${r.title}`} disabled={pending || index === 0} onClick={() => move(r.id, index - 1)}><ArrowUp /></IconButton>}
                        {canSort && <IconButton label={`Descer ${r.title}`} disabled={pending || index === list.length - 1} onClick={() => move(r.id, index + 1)}><ArrowDown /></IconButton>}
                        <IconButton danger label={`Excluir ${r.title}`} onClick={() => setDeleting(r)}><Trash2 /></IconButton>
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.active}
                      aria-label={`${r.title} no atendimento`}
                      title={r.active ? 'Aparece no atendimento' : 'Não aparece no atendimento'}
                      disabled={pending}
                      onClick={() => run(() => toggleQuickReplyAction(r.id, !r.active), list.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)))}
                      className={cx('relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed', r.active ? 'bg-brand' : 'bg-white/15')}
                    >
                      <span className={cx('absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform', r.active && 'translate-x-4')} />
                    </button>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nada encontrado para “{query.trim()}”.</li>}
          </ul>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-white/[0.015] px-4 py-3">
              <span className="text-xs text-muted-foreground">A ordem daqui é a mesma do atendimento.</span>
              <Button variant="ghost" disabled={pending} onClick={restore} title="Adiciona só as padrão que faltam, sem mexer nas suas"><RotateCcw />Adicionar padrão</Button>
            </div>
          )}
        </Card>
      )}

      {draft && (
        <QuickReplyEditor
          draft={draft}
          variables={variables}
          taken={list.filter((r) => r.id !== draft.id).map((r) => r.shortcut)}
          onClose={() => setDraft(null)}
          onSaved={(message) => { setDraft(null); setError(null); setNotice(message); }}
        />
      )}

      {deleting && createPortal(
        <div role="alertdialog" aria-modal="true" aria-labelledby="excluir-mensagem-titulo" className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" tabIndex={-1} aria-label="Fechar" onClick={() => setDeleting(null)} className="absolute inset-0 animate-overlay-in cursor-default bg-black/60 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-sm animate-pop-in overflow-hidden rounded-card border border-border bg-card shadow-overlay">
            <div className="space-y-2 p-5">
              <h2 id="excluir-mensagem-titulo" className="font-semibold">Excluir “{deleting.title}”?</h2>
              <p className="text-sm text-muted-foreground">O atalho /{deleting.shortcut} deixa de existir. Para só tirar do atendimento, desative.</p>
              <p className="line-clamp-3 whitespace-pre-line rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">{fillVariables(deleting.body, variables)}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-background/40 px-5 py-3">
              <Button autoFocus variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => { const { id } = deleting; setDeleting(null); run(() => deleteQuickReplyAction(id), list.filter((r) => r.id !== id)); }}><Trash2 />Excluir</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
