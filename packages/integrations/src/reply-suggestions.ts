import { REPLY_SYSTEM } from '@lps/config';
import { buildSourceText, type Lead } from '@lps/domain';
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
