'use client';

import { FileText, Send, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { ErrorNote } from '@/components/ui';

export type Template = { label: string; text: string };

type Props = {
  initialText: string;
  /** Motivo do bloqueio: o campo fica desabilitado e o texto aparece no lugar da dica. */
  blockReason: string | null;
  templates: Template[];
  /** Este envio seria um primeiro contato. */
  firstContact: boolean;
  dailyCount: number;
  dailyLimit: number;
  /** O balão da conversa mostra o erro e o "Tentar de novo". */
  onSend: (text: string, clientMessageId: string) => Promise<void>;
  onSuggest: () => Promise<{ text?: string; error?: string }>;
};

export function Composer({ initialText, blockReason, templates, firstContact, dailyCount, dailyLimit, onSend, onSuggest }: Props) {
  const [text, setText] = useState(initialText);
  const [suggested, setSuggested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [menu, setMenu] = useState(false);
  const sending = useRef(false);
  const blocked = !!blockReason;
  const needsValue = text.includes('[valor]');

  async function send() {
    const body = text.trim();
    if (blocked || !body || sending.current) return;
    if (firstContact && dailyCount >= dailyLimit && !window.confirm(`Você já enviou ${dailyCount} primeiros contatos hoje (limite de ${dailyLimit}). Enviar mesmo assim?`)) return;
    if (needsValue && !window.confirm('A mensagem ainda tem [valor]. Enviar assim mesmo?')) return;
    sending.current = true;
    setError(null);
    setText('');
    setSuggested(false);
    await onSend(body, crypto.randomUUID());
    sending.current = false;
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    const out = await onSuggest();
    setSuggesting(false);
    if (out.error) setError(out.error);
    if (out.text) {
      setText(out.text);
      setSuggested(true);
    }
  }

  return (
    <div className="border-t border-border px-4 pb-4 pt-3">
      {blocked ? (
        <p className="mb-2 text-xs text-destructive">{blockReason}</p>
      ) : suggested ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />Sugestão da IA · revise e preencha o [valor] antes de enviar
        </p>
      ) : null}
      {error && <div className="mb-2"><ErrorNote>{error}</ErrorNote></div>}
      <div className={`rounded-lg border border-input bg-input-bg ${blocked ? 'opacity-60' : ''}`}>
        <textarea
          aria-label="Mensagem"
          rows={3}
          disabled={blocked}
          value={text}
          placeholder={blocked ? '' : 'Escreva a mensagem. Enter envia, Shift+Enter quebra a linha.'}
          onChange={(e) => { setText(e.target.value); setSuggested(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className="max-h-48 w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <div className="relative flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex items-center gap-1">
            <button type="button" disabled={blocked || suggesting} onClick={suggest} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <Sparkles className="size-4" />{suggesting ? 'Gerando…' : 'Sugerir resposta'}
            </button>
            {templates.length > 0 && (
              <button type="button" disabled={blocked} onClick={() => setMenu((v) => !v)} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                <FileText className="size-4" />Mensagens prontas
              </button>
            )}
            {menu && (
              <ul className="absolute bottom-11 left-2 z-10 w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
                {templates.map((t) => (
                  <li key={t.label}>
                    <button type="button" onClick={() => { setText(t.text); setSuggested(false); setMenu(false); }} className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">{t.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" disabled={blocked || !text.trim()} onClick={() => void send()} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="size-4" />Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
