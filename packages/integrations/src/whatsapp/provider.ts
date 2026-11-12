import { requireOptional } from '@lps/config';
import type { WhatsAppProvider } from '@lps/domain';
import { createEvolutionProvider } from './evolution';

type Source = Record<string, string | undefined>;

/**
 * Lê a configuração só na hora de usar: sem Evolution configurada, o resto do app segue funcionando.
 * A instância vem do banco (whatsapp_connection.instance, ver getActiveInstance); EVOLUTION_INSTANCE é só o padrão.
 */
export function getWhatsAppProvider(source: Source = process.env, instance?: string | null): WhatsAppProvider {
  return createEvolutionProvider({
    baseUrl: requireOptional('EVOLUTION_URL', source),
    apiKey: requireOptional('EVOLUTION_API_KEY', source),
    instance: instance || source.EVOLUTION_INSTANCE || '',
  });
}
