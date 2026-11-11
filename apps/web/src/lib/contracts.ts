import { MESSAGES } from '@lps/config/messages';

/** Abre o CRM na conversa do contato com o contrato já escrito no campo de envio. */
export function contractWhatsAppHref(contactId: string, signUrl: string | null): string | null {
  if (!signUrl) return null;
  const texto = MESSAGES.contrato.replace('[link]', signUrl);
  return `/painel/crm?${new URLSearchParams({ contato: contactId, texto })}`;
}
