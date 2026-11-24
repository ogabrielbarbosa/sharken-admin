/** Cada um edita o próprio perfil; o dono (ou administrador) edita o de quem é membro do workspace em uso. */
export function canEditProfile(input: { me: string; target: string; canManage: boolean; memberIds: string[] }): boolean {
  return input.target === input.me || (input.canManage && input.memberIds.includes(input.target));
}
