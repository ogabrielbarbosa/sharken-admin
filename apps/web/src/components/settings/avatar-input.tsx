'use client';

import { AVATAR_MAX_BYTES } from '@lps/domain';

/** Confere o tamanho antes do envio: a Vercel recusa corpos grandes antes da action rodar. */
export function AvatarInput() {
  return (
    <input
      name="avatar"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.setCustomValidity(file && file.size > AVATAR_MAX_BYTES ? 'Envie uma imagem JPG, PNG ou WebP de até 2 MB.' : '');
        e.currentTarget.reportValidity();
      }}
      className="block w-full text-sm text-muted-foreground file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:text-foreground"
    />
  );
}
