'use client';

import { AVATAR_MAX_BYTES } from '@lps/domain';
import { Camera, LoaderCircle, X } from 'lucide-react';
import { unstable_rethrow } from 'next/navigation';
import { useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { saveProfileAction } from '@/app/painel/configuracoes/actions';
import { Avatar } from '@/components/crm/avatar';

type Props = { userId: string; name: string | null; email: string; avatarUrl: string | null; isMe: boolean; canEdit: boolean };

/** Foto e nome editados no lugar: clicar na foto troca, clicar no nome edita, sair do campo salva. */
export function ProfileEditor({ userId, name, email, avatarUrl, isMe, canEdit }: Props) {
  const [shownName, setShownName] = useOptimistic(name);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingName, startName] = useTransition();
  const [savingPhoto, startPhoto] = useTransition();
  const cancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const label = shownName || email;

  /** Devolve se salvou; o erro aparece abaixo do nome. */
  async function save(fields: Record<string, string | File>): Promise<boolean> {
    const form = new FormData();
    form.set('user_id', userId);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    try {
      const { error } = await saveProfileAction(form);
      setError(error);
      return !error;
    } catch (err) {
      unstable_rethrow(err);
      setError('Não foi possível salvar. Tente de novo.');
      return false;
    }
  }

  function commitName() {
    if (draft === null) return;
    const value = draft.trim();
    setDraft(null);
    if (cancelled.current || !value || value === name) {
      setError(null);
      return;
    }
    startName(async () => {
      setShownName(value);
      // Se falhar, o que foi digitado volta para o campo.
      if (!(await save({ name: value }))) setDraft((d) => d ?? value);
    });
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') cancelled.current = true;
    if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
  }

  function pickPhoto(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    // A Vercel recusa corpos grandes antes da action rodar.
    if (file.size > AVATAR_MAX_BYTES) return setError('Envie uma imagem JPG, PNG ou WebP de até 2 MB.');
    startPhoto(async () => { await save({ avatar: file }); });
  }

  const photo = <Avatar name={label} src={avatarUrl} seed={userId} size={36} />;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {canEdit ? (
        <div className="group/photo relative size-9 shrink-0">
          <button
            type="button"
            aria-label={`Trocar a foto de ${label}`}
            title="Trocar foto"
            disabled={savingPhoto}
            onClick={() => fileInput.current?.click()}
            className="relative block size-9 cursor-pointer overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {photo}
            <span className={`absolute inset-0 grid place-items-center bg-black/55 text-white transition-opacity ${savingPhoto ? '' : 'opacity-0 group-hover/photo:opacity-100 group-focus-within/photo:opacity-100'}`}>
              {savingPhoto ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </span>
          </button>
          {avatarUrl && !savingPhoto && (
            <button
              type="button"
              aria-label={`Remover a foto de ${label}`}
              title="Remover foto"
              onClick={() => startPhoto(async () => { await save({ remove_avatar: 'on' }); })}
              className="absolute -top-1 -right-1 grid size-4 cursor-pointer place-items-center rounded-full border border-border bg-card pointer-events-none text-muted-foreground opacity-0 group-hover/photo:pointer-events-auto group-hover/photo:opacity-100 hover:text-foreground focus-visible:opacity-100"
            >
              <X className="size-2.5" />
            </button>
          )}
          <input ref={fileInput} type="file" hidden aria-label={`Foto de ${label}`} accept="image/jpeg,image/png,image/webp" onChange={(e) => pickPhoto(e.currentTarget.files?.[0])} />
        </div>
      ) : photo}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {draft !== null ? (
            <input
              autoFocus
              aria-label="Nome"
              placeholder="Nome"
              maxLength={80}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitName}
              onKeyDown={onNameKey}
              className="-ml-1.5 w-full max-w-72 rounded-md bg-white/5 px-1.5 py-0.5 outline-none ring-1 ring-ring/60"
            />
          ) : canEdit ? (
            <button
              type="button"
              title="Editar nome"
              aria-label={`Editar o nome de ${label}`}
              disabled={savingName}
              onClick={() => { cancelled.current = false; setDraft(name ?? ''); }}
              className="-ml-1.5 min-w-0 cursor-text truncate rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {label}
            </button>
          ) : <span className="truncate">{label}</span>}
          {isMe && <span className="shrink-0 text-muted-foreground">· você</span>}
          {savingName && <LoaderCircle aria-label="Salvando" className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        {shownName && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
