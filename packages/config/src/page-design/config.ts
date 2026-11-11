import { fileURLToPath } from 'node:url';

// Configuração do agente que escreve a página de exemplo.
export const PAGE_AGENT = {
  /** Modelo padrão. Troque por PAGE_AGENT_MODEL no .env. */
  defaultModel: 'claude-opus-5-5',
  /** Limite de turnos do agente em cada tentativa. */
  maxTurns: 40,
  /** Tentativas dentro de uma mesma tarefa, cada uma com os problemas da anterior. */
  attempts: 3,
  /** Tempo máximo de cada tentativa. */
  timeoutMs: 10 * 60_000,
};

export const PAGE_GUIDE_PATH = fileURLToPath(new URL('./GUIA.md', import.meta.url));

export function pageAgentModel(source: Record<string, string | undefined> = process.env): string {
  return source.PAGE_AGENT_MODEL?.trim() || PAGE_AGENT.defaultModel;
}
