import { getActiveInstance, importHistory } from '@lps/db';
import { getWhatsAppProvider } from '@lps/integrations';
import { JobFailure, type Handler } from './types';

const DAY_MS = 24 * 3600_000;

/** Traz para o CRM as conversas dos últimos dias guardadas na Evolution. Tudo entra fechado. */
export const importHistoryJob: Handler = async (db, job) => {
  const instance = await getActiveInstance(db);
  if (!instance) throw new JobFailure('Nenhuma instância em uso.');
  const days = Number(job.payload.days) > 0 ? Number(job.payload.days) : 2;
  const provider = getWhatsAppProvider(process.env, instance);
  const events = await provider.recentMessages(new Date(Date.now() - days * DAY_MS));
  const profiles = await provider.contactProfiles();
  const out = await importHistory(db, events, new Date(), profiles);
  console.log(`[import_history] ${out.messages} mensagens novas em ${out.contacts} conversas (${events.length} lidas da Evolution).`);
};
