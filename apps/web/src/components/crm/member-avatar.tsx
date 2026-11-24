'use client';

import { stableAvatar } from '@/lib/avatar-url';
import type { Member } from '@/lib/members';
import { Avatar } from './avatar';

export function MemberAvatar({ member, size }: { member: Member; size: number }) {
  return <Avatar name={member.name} src={stableAvatar(member.avatarUrl)} seed={member.id} size={size} />;
}

/** Foto do responsável na lista de conversas, com o nome no hover. */
export function ResponsibleAvatar({ member }: { member: Member }) {
  return (
    <span role="img" aria-label={`Responsável: ${member.name}`} className="group/resp relative inline-flex shrink-0">
      <MemberAvatar member={member} size={18} />
      <span aria-hidden className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 hidden w-max max-w-48 truncate rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-lg group-hover/resp:block">{member.name}</span>
    </span>
  );
}
