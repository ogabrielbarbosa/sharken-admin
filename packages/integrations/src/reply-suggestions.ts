import { REPLY_SYSTEM } from '@lps/config';
import { buildSourceText, type Lead, type Message } from '@lps/domain';
import { generateText } from './anthropic';

export function buildReplyPrompt(lead: Lead, incomingText: string): { system: string; user: string } {
  return {
    system: REPLY_SYSTEM,
    user: `Dados do negócio:\n<dados>\n${buildSourceText(lead)}\n</dados>\n\nMensagem recebida da pessoa:\n<mensagem>\n${incomingText}\n</mensagem>\n\nEscreva só o texto da resposta.`,
  };
}

export function suggestReply(lead: Lead, incomingText: string): Promise<string> {
  return generateText(buildReplyPrompt(lead, incomingText));
}

const HISTORY_LIMIT = 20;

/** Conversa com as últimas 20 mensagens de texto, da mais antiga para a mais nova. */
export function buildConversationReplyPrompt(
  lead: Lead | null,
  contactName: string,
  messages: Pick<Message, 'direction' | 'kind' | 'body'>[],
): { system: string; user: string } {
  const lines = messages
    .filter((m) => m.kind === 'texto' && m.body?.trim())
    .slice(-HISTORY_LIMIT)
    .map((m) => `${m.direction === 'entrada' ? 'Pessoa' : 'Gabriel'}: ${m.body!.trim()}`);
  const data = lead ? buildSourceText(lead) : `Nome: ${contactName}`;
  return {
    system: REPLY_SYSTEM,
    user: `Dados do negócio:\n<dados>\n${data}\n</dados>\n\nConversa até agora:\n<conversa>\n${lines.join('\n')}\n</conversa>\n\nEscreva só o texto da próxima resposta do Gabriel.`,
  };
}

export function suggestConversationReply(lead: Lead | null, contactName: string, messages: Pick<Message, 'direction' | 'kind' | 'body'>[]): Promise<string> {
  return generateText(buildConversationReplyPrompt(lead, contactName, messages));
}
