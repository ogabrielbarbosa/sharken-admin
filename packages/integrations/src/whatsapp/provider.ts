import { requireOptional } from '@lps/config';
import type { WhatsAppProvider } from '@lps/domain';
import { createEvolutionProvider } from './evolution';

type Source = Record<string, string | undefined>;

/** Lê a configuração só na hora de usar: sem Evolution configurada, o resto do app segue funcionando. */
export function getWhatsAppProvider(source: Source = process.env): WhatsAppProvider {
  return createEvolutionProvider({
    baseUrl: requireOptional('EVOLUTION_URL', source),
    apiKey: requireOptional('EVOLUTION_API_KEY', source),
    instance: requireOptional('EVOLUTION_INSTANCE', source),
  });
}
