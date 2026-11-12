import './env';
import { createAdminClient, enqueueJob, logEvent, updateBatch } from '@lps/db';

/**
 * Aplica as regras novas a um batch já buscado:
 * - quem foi descartado pela regra antiga (sem celular, fechado) volta para a análise, agora com o
 *   enriquecimento (site, WHOIS, CNPJ) e a checagem de franquia;
 * - quem está em Novo lead e ainda não foi enriquecido ganha só a procura de contatos.
 * Uso: pnpm leads:reprocess <batch_id> [--dry]
 */
const [batchId, flag] = process.argv.slice(2).filter((a) => a !== '--');
if (!batchId) {
  console.error('Uso: pnpm leads:reprocess <batch_id> [--dry]');
  process.exit(1);
}
const dry = flag === '--dry';
const OLD_RULES = ['Sem telefone celular no cadastro', 'Negócio fechado'];
const db = createAdminClient();

const { data, error } = await db.from('leads').select('id, name, stage, exit_reason, enrichment').eq('batch_id', batchId);
if (error) throw new Error(error.message);
const leads = data as { id: string; name: string; stage: string; exit_reason: string | null; enrichment: unknown }[];

const back = leads.filter((l) => l.stage === 'descartado' && l.exit_reason && l.exit_reason.split('; ').every((r) => OLD_RULES.includes(r)));
const enrich = leads.filter((l) => l.stage === 'revisar' && !l.enrichment);
console.log(`${back.length} voltam para a análise, ${enrich.length} só ganham a procura de contatos.`);
if (dry) {
  for (const l of back) console.log(`  análise: ${l.name}`);
  process.exit(0);
}

const stamp = Date.now();
for (const l of back) {
  const { error: e } = await db.from('leads')
    .update({ stage: 'analisando', exit_reason: null, site_status: null, site_checks: [], enrichment: null, error: null, stage_changed_at: new Date().toISOString() })
    .eq('id', l.id).eq('stage', 'descartado');
  if (e) throw new Error(e.message);
  await logEvent(db, l.id, 'reanalise', { motivo_antigo: l.exit_reason });
  await enqueueJob(db, { type: 'analyze_lead', payload: { lead_id: l.id, batch_id: batchId }, dedupeKey: `analyze_lead:${l.id}:${stamp}` });
}
if (back.length) await updateBatch(db, batchId, { status: 'analisando' });
for (const l of enrich) {
  await enqueueJob(db, { type: 'enrich_lead', payload: { lead_id: l.id }, dedupeKey: `enrich_lead:${l.id}` });
}
console.log('Tarefas criadas. O worker da VPS processa em seguida.');
