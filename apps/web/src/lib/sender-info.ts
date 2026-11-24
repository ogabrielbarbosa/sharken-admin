import type { MemberProfile, Message } from '@lps/domain';

export type SenderInfo = {
  title: string;
  email: string | null;
  avatar: string | null;
  /** Nome que gera as iniciais quando não há foto. */
  avatarName: string;
  seed: string;
  /** Nula na nota interna, que não passa pelo WhatsApp. */
  connection: string | null;
  connectionPhone: string | null;
};

const phoneLabel = (phone: string | null | undefined) => (phone ? phone.replace(/^\+?55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3') : null);

/** Quem enviou a mensagem (ou escreveu a nota) e por qual conexão, para a foto e o card do chat. */
export function senderInfo(
  m: Pick<Message, 'direction' | 'sent_from' | 'sent_by' | 'sent_by_email' | 'connection_name' | 'connection_phone'>,
  profiles: Record<string, MemberProfile>,
  connection: { name: string; avatar: string | null },
): SenderInfo {
  const phone = phoneLabel(m.connection_phone);
  const via = m.direction === 'nota'
    ? { connection: null, connectionPhone: null }
    : { connection: m.connection_name || phone || 'não registrada', connectionPhone: m.connection_name ? phone : null };
  if (!m.sent_by) {
    const title = m.sent_from === 'celular' ? 'Enviada pelo celular' : 'Remetente não registrado';
    return { title, email: null, avatar: connection.avatar, avatarName: connection.name, seed: 'eu', ...via };
  }
  const profile = profiles[m.sent_by];
  const email = m.sent_by_email || null;
  const title = profile?.name || email || 'Membro sem nome';
  return { title, email: profile?.name ? email : null, avatar: profile?.avatarUrl ?? null, avatarName: title, seed: m.sent_by, ...via };
}
