'use client';

import { ChevronDown, FileText, Image as ImageIcon, Loader2, Lock, LockOpen, Mic, Paperclip, PenLine, Reply, Send, Smile, Square, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorNote } from '@/components/ui';

export type Template = { label: string; text: string };
export type QuickReplyItem = { shortcut: string; title: string; text: string };
export type Variable = { key: string; label: string; value: string | null };

type Props = {
  initialText: string;
  /** Motivo do bloqueio: Mensagem fica desabilitada (Nota continua livre). */
  blockReason: string | null;
  templates: Template[];
  quickReplies: QuickReplyItem[];
  variables: Variable[];
  senderPhone: string | null;
  signatureName: string;
  /** Este envio seria um primeiro contato. */
  firstContact: boolean;
  dailyCount: number;
  dailyLimit: number;
  onSend: (text: string, clientMessageId: string) => Promise<void>;
  onSendMedia: (file: File, caption: string, asAudio: boolean, clientMessageId: string) => Promise<void>;
  onNote: (text: string) => Promise<boolean>;
  onAfterSendClose: () => Promise<void>;
  /** Mensagem sendo respondida (aparece numa faixa em cima do campo). */
  replyTo: { author: string; text: string } | null;
  onCancelReply: () => void;
  /** Atendimento fechado: o campo fica coberto até abrir o atendimento. */
  closed: boolean;
  onReopen: () => Promise<void>;
  /** Arquivo solto em cima da conversa; `n` muda a cada soltura. */
  droppedFile: { file: File; n: number } | null;
};

const EMOJIS = ['😀', '😁', '😂', '😊', '😉', '😍', '🤩', '😎', '🤔', '😅', '🙏', '👍', '👏', '🙌', '💪', '🤝', '👋', '👀', '✅', '❌', '⚠️', '🔥', '🚀', '💡', '🎉', '❤️', '💬', '📞', '📍', '📅', '⏰', '💰', '📈', '⭐', '✨', '😉'];
const SIGNATURE_KEY = 'crm:assinatura';

/** Troca as $variáveis conhecidas pelo valor do contato; as sem valor ficam como estão. */
export function fillVariables(text: string, vars: Variable[]): string {
  return text.replace(/\$([a-z_]+)/g, (all, key: string) => vars.find((v) => v.key === key)?.value ?? all);
}

function ToolButton({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`press inline-flex size-9 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-5 ${active ? 'bg-accent text-foreground' : 'text-neutral-300 hover:bg-accent hover:text-foreground'}`}
    >
      {children}
    </button>
  );
}

function Popover({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`absolute bottom-full z-30 mb-2 rounded-lg border border-border bg-card p-1 shadow-2xl ${className}`}>{children}</div>;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Composer(props: Props) {
  const { initialText, blockReason, templates, quickReplies, variables, senderPhone, signatureName, firstContact, dailyCount, dailyLimit } = props;
  const [mode, setMode] = useState<'mensagem' | 'nota'>('mensagem');
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | 'emoji' | 'prontas' | 'enviar'>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [signature, setSignature] = useState(false);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [recording, setRecording] = useState<{ seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const [reopening, setReopening] = useState(false);
  const { replyTo, onCancelReply, closed, droppedFile } = props;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const note = mode === 'nota';
  const blocked = !note && !!blockReason;
  const canAttach = !note && !blocked && !closed;

  // Arquivo solto em cima da conversa vira anexo.
  useEffect(() => {
    if (!droppedFile) return;
    if (canAttach) setFile(droppedFile.file);
    else setError(note ? 'Notas não levam arquivo. Troque para Mensagem.' : 'Não dá para enviar arquivo agora.');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage a uma soltura nova
  }, [droppedFile]);
  // Escolheu responder: o cursor vai para o campo.
  useEffect(() => {
    if (!replyTo) return;
    if (note) setMode('mensagem');
    area.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao escolher a mensagem
  }, [replyTo]);

  useEffect(() => {
    try { setSignature(localStorage.getItem(SIGNATURE_KEY) === '1'); } catch { /* sem storage */ }
  }, []);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // O campo cresce com o texto, até 8 linhas.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // "/" no começo abre as respostas rápidas; "$palavra" antes do cursor abre as variáveis.
  const slash = !note && /^\/(\S*)$/.exec(text)?.[1];
  const dollar = /\$([a-z_]*)$/.exec(text.slice(0, caret))?.[1];
  const suggestions = useMemo(() => {
    if (slash !== undefined && slash !== false) {
      const q = slash.toLowerCase();
      return quickReplies.filter((r) => r.shortcut.includes(q) || r.title.toLowerCase().includes(q)).map((r) => ({ id: r.shortcut, title: `/${r.shortcut}`, hint: r.title, apply: () => setText(fillVariables(r.text, variables)) }));
    }
    if (dollar !== undefined) {
      return variables.filter((v) => v.key.startsWith(dollar)).map((v) => ({
        id: v.key,
        title: `$${v.key}`,
        hint: v.value ?? `${v.label} (sem valor)`,
        apply: () => {
          const start = caret - dollar.length - 1;
          const value = v.value ?? `$${v.key}`;
          setText(text.slice(0, start) + value + text.slice(caret));
          requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(start + value.length, start + value.length); });
        },
      }));
    }
    return [];
  }, [slash, dollar, quickReplies, variables, caret, text]);
  useEffect(() => setHighlight(0), [suggestions.length]);

  function insert(value: string) {
    const el = area.current;
    const pos = el?.selectionStart ?? text.length;
    setText(text.slice(0, pos) + value + text.slice(pos));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + value.length, pos + value.length); });
  }

  function withSignature(body: string) {
    return signature && !note ? `*${signatureName}:*\n${body}` : body;
  }

  async function submit(andClose = false) {
    setMenu(null);
    const body = text.trim();
    if (busy.current || closed) return;
    if (note) {
      if (!body) return;
      busy.current = true;
      setError(null);
      if (await props.onNote(body)) setText('');
      busy.current = false;
      return;
    }
    if (blocked || (!body && !file)) return;
    if (firstContact && dailyCount >= dailyLimit && !window.confirm(`Você já enviou ${dailyCount} primeiros contatos hoje (limite de ${dailyLimit}). Enviar mesmo assim?`)) return;
    if (body.includes('[valor]') && !window.confirm('A mensagem ainda tem [valor]. Enviar assim mesmo?')) return;
    busy.current = true;
    setError(null);
    const sending = file;
    setText('');
    setFile(null);
    if (sending) await props.onSendMedia(sending, body ? withSignature(body) : '', false, crypto.randomUUID());
    else await props.onSend(withSignature(body), crypto.randomUUID());
    busy.current = false;
    if (andClose) await props.onAfterSendClose();
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      discard.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        if (discard.current || !chunks.current.length) return;
        const mime = (rec.mimeType || 'audio/webm').split(';')[0]!;
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
        const audio = new File(chunks.current, `audio-${Date.now()}.${ext}`, { type: mime });
        void props.onSendMedia(audio, '', true, crypto.randomUUID());
      };
      rec.start();
      recorder.current = rec;
      setRecording({ seconds: 0 });
    } catch {
      setError('Não foi possível usar o microfone. Confira a permissão do navegador.');
    }
  }
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecording((r) => (r ? { seconds: r.seconds + 1 } : r)), 1000);
    return () => clearInterval(id);
  }, [recording]);
  const stopRecording = (cancel: boolean) => {
    discard.current = cancel;
    recorder.current?.stop();
    recorder.current = null;
  };

  const canSend = !closed && (note ? !!text.trim() : !blocked && (!!text.trim() || !!file));

  return (
    <div className="px-4 pb-4 pt-1">
      {error && <div className="mb-2"><ErrorNote>{error}</ErrorNote></div>}
      <div ref={root} className={`relative rounded-xl border shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-colors ${note ? 'border-amber-500/30 bg-amber-950/25' : 'border-border bg-card'}`}>
        {/* Cabeçalho: Mensagem / Nota e o número que envia */}
        <div className="flex items-center justify-between gap-3 px-3 pt-3">
          <div className="inline-flex rounded-lg border border-border bg-background/60 p-0.5 text-xs">
            <button type="button" onClick={() => setMode('mensagem')} className={`h-7 cursor-pointer rounded-md px-3 font-medium ${!note ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Mensagem</button>
            <button type="button" onClick={() => setMode('nota')} className={`h-7 cursor-pointer rounded-md px-3 font-medium ${note ? 'bg-amber-500/15 text-amber-300' : 'text-muted-foreground hover:text-foreground'}`}>Nota</button>
          </div>
          {note ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-300/80"><StickyNote className="size-3.5" />Visível só para você</span>
          ) : blockReason ? (
            <span className="truncate text-xs text-destructive">{blockReason}</span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              Enviando de <span className="font-medium text-foreground">{senderPhone ?? 'WhatsApp'}</span>
              <Lock className="size-3" aria-label="Número conectado" />
            </span>
          )}
        </div>

        {/* Respondendo a uma mensagem */}
        {replyTo && !note && (
          <div className="mx-3 mt-3 flex animate-slide-up items-center gap-3 rounded-lg border-l-[3px] border-brand-soft bg-background/60 py-2 pl-3 pr-2">
            <Reply className="size-4 shrink-0 text-brand-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-brand-soft">Respondendo a {replyTo.author}</p>
              <p className="truncate text-xs text-muted-foreground">{replyTo.text}</p>
            </div>
            <button type="button" aria-label="Cancelar resposta" onClick={onCancelReply} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}

        {/* Anexo escolhido */}
        {file && !note && (
          <div className="mx-3 mt-3 flex animate-slide-up items-center gap-3 rounded-lg border border-border bg-background/60 p-2">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-12 rounded-md object-cover" />
            ) : (
              <span className="inline-flex size-12 items-center justify-center rounded-md bg-secondary"><FileText className="size-5 text-muted-foreground" /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · o texto vai como legenda</p>
            </div>
            <button type="button" aria-label="Remover anexo" onClick={() => setFile(null)} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
          </div>
        )}

        {/* Texto ou gravação */}
        {recording ? (
          <div className="flex h-[68px] items-center gap-3 px-4">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
            <span className="font-mono text-sm">{fmt(recording.seconds)}</span>
            <span className="text-sm text-muted-foreground">Gravando áudio…</span>
          </div>
        ) : (
          <div className="relative">
            {suggestions.length > 0 && (
              <Popover className="left-3 w-80">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{slash !== undefined && slash !== false ? 'Respostas rápidas' : 'Variáveis'}</p>
                <ul className="max-h-60 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <li key={s.id}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); s.apply(); }} onMouseEnter={() => setHighlight(i)} className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-left ${i === highlight ? 'bg-accent' : ''}`}>
                        <span className="shrink-0 font-mono text-xs text-foreground">{s.title}</span>
                        <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Popover>
            )}
            <textarea
              ref={area}
              aria-label={note ? 'Nota interna' : 'Mensagem'}
              rows={2}
              disabled={blocked || closed}
              value={text}
              placeholder={note ? 'Escreva uma nota interna. Só você vê.' : blocked ? '' : "'/' resposta rápida · '$' variável"}
              onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onPaste={(e) => {
                // Print ou imagem copiada: vira anexo, e o texto escrito vai como legenda.
                const pasted = Array.from(e.clipboardData.files)[0];
                if (!pasted) return;
                e.preventDefault();
                if (!canAttach) { setError(note ? 'Notas não levam imagem. Troque para Mensagem.' : 'Não dá para enviar arquivo agora.'); return; }
                const ext = pasted.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
                setFile(pasted.name && pasted.name !== 'image.png' ? pasted : new File([pasted], `colado-${Date.now()}.${ext}`, { type: pasted.type }));
              }}
              onKeyDown={(e) => {
                if (suggestions.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); suggestions[highlight]?.apply(); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setText(text.replace(/^\//, '')); return; }
                }
                if (e.key === 'Escape' && replyTo) { e.preventDefault(); onCancelReply(); return; }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-2 pt-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
          </div>
        )}

        {/* Ferramentas e envio */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="relative flex items-center gap-0.5">
            {recording ? (
              <>
                <ToolButton label="Descartar áudio" onClick={() => stopRecording(true)}><Trash2 /></ToolButton>
                <button type="button" onClick={() => stopRecording(false)} className="ml-1 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-destructive/15 px-3 text-xs font-medium text-destructive hover:bg-destructive/25"><Square className="size-3 fill-current" />Parar e enviar</button>
              </>
            ) : (
              <>
                <ToolButton label="Emoji" active={menu === 'emoji'} onClick={() => setMenu(menu === 'emoji' ? null : 'emoji')}><Smile /></ToolButton>
                <ToolButton label="Imagem ou vídeo" disabled={!canAttach} onClick={() => imageInput.current?.click()}><ImageIcon /></ToolButton>
                <ToolButton label="Anexar arquivo (ou cole / arraste)" disabled={!canAttach} onClick={() => fileInput.current?.click()}><Paperclip /></ToolButton>
                <ToolButton label="Gravar áudio" disabled={!canAttach || !!file} onClick={() => void startRecording()}><Mic /></ToolButton>
                <ToolButton label="Mensagens prontas" disabled={note || blocked} active={menu === 'prontas'} onClick={() => setMenu(menu === 'prontas' ? null : 'prontas')}><FileText /></ToolButton>
                <span className="mx-1 h-5 w-px bg-border" />
                <ToolButton
                  label={signature ? `Assinatura ligada (*${signatureName}:*)` : 'Assinar mensagens'}
                  active={signature}
                  disabled={note}
                  onClick={() => setSignature((v) => { try { localStorage.setItem(SIGNATURE_KEY, v ? '0' : '1'); } catch { /* sem storage */ } return !v; })}
                >
                  <PenLine />
                </ToolButton>
              </>
            )}
            <input ref={imageInput} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
            <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />

            {menu === 'emoji' && (
              <Popover className="left-0 w-72">
                <div className="grid grid-cols-9 gap-0.5 p-1">
                  {EMOJIS.map((em, i) => (
                    <button key={`${em}-${i}`} type="button" onClick={() => { insert(em); setMenu(null); }} className="cursor-pointer rounded-md p-1 text-lg leading-none hover:bg-accent">{em}</button>
                  ))}
                </div>
              </Popover>
            )}
            {menu === 'prontas' && (
              <Popover className="left-0 w-80">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mensagens prontas</p>
                <ul className="max-h-72 overflow-y-auto">
                  {[...templates.map((t) => ({ id: t.label, title: t.label, text: t.text })), ...quickReplies.map((r) => ({ id: r.shortcut, title: r.title, text: fillVariables(r.text, variables) }))].map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => { setText(t.text); setMenu(null); area.current?.focus(); }} className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left hover:bg-accent">
                        <span className="block text-sm">{t.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Popover>
            )}
          </div>

          {!recording && (
            <div className="relative flex items-center">
              {note ? (
                <button type="button" disabled={!canSend} onClick={() => void submit()} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-amber-500/20 px-4 text-sm font-medium text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-40">
                  <StickyNote className="size-4" />Salvar nota
                </button>
              ) : (
                <div className={`inline-flex h-9 items-stretch overflow-hidden rounded-lg transition-[background-color,opacity] duration-200 ${canSend ? 'bg-brand text-white' : 'bg-secondary opacity-50'}`}>
                  <button type="button" disabled={!canSend} onClick={() => void submit()} className="press inline-flex cursor-pointer items-center gap-2 px-4 text-sm font-medium hover:bg-white/10 disabled:cursor-not-allowed [&:active:not(:disabled)_svg]:translate-x-0.5 [&:active:not(:disabled)_svg]:-translate-y-0.5 [&_svg]:transition-transform">
                    <Send className="size-4" />Enviar
                  </button>
                  <span className="my-2 w-px bg-border" />
                  <button type="button" aria-label="Mais opções de envio" disabled={!canSend} onClick={() => setMenu(menu === 'enviar' ? null : 'enviar')} className="inline-flex cursor-pointer items-center px-2 hover:bg-white/10 disabled:cursor-not-allowed">
                    <ChevronDown className="size-4" />
                  </button>
                </div>
              )}
              {menu === 'enviar' && (
                <Popover className="right-0 w-56">
                  <button type="button" onClick={() => void submit()} className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">Enviar</button>
                  <button type="button" onClick={() => void submit(true)} className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">Enviar e fechar atendimento</button>
                </Popover>
              )}
            </div>
          )}
        </div>

        {/* Atendimento fechado: nada sai até abrir de novo (como no LíderHub). */}
        {closed && (
          <div className="absolute inset-0 z-40 flex animate-overlay-in items-center justify-between gap-3 rounded-xl bg-background/80 px-4 backdrop-blur-sm">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4 shrink-0" />Atendimento fechado. Abra para enviar mensagens.</span>
            <button
              type="button"
              disabled={reopening}
              onClick={async () => { setReopening(true); try { await props.onReopen(); } finally { setReopening(false); } }}
              className="press inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-bright disabled:cursor-wait disabled:opacity-70"
            >
              {reopening ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}Abrir atendimento
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
