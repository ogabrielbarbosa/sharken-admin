/** Nome e foto de um usuário, como o painel mostra. */
export type MemberProfile = { userId: string; name: string | null; avatarUrl: string | null };

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function parseProfileName(raw: string): string {
  const name = raw.trim();
  if (name.length < 2 || name.length > 80) throw new Error('O nome precisa ter entre 2 e 80 caracteres.');
  return name;
}

/** Tipo da imagem pela assinatura do arquivo: o nome e o mime enviados pelo navegador não são confiáveis. */
export function avatarMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}
