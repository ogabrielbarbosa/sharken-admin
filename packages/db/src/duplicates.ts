import { keysOf, mergeIncoming, pairKey, possibleDuplicates, type Lead, type NewLead } from '@lps/domain';
import type { Db } from './client';
import { fetchAll } from './fetch-all';
import { getLeadsByIds, logEvent, updateLead } from './leads';

const COLUMNS = 'id, name, city, stage, place_id, instagram_url, website_url, phone_e164, batch_id, created_at';
type Row = Pick<Lead, 'id' | 'name' | 'city' | 'stage' | 'place_id' | 'instagram_url' | 'website_url' | 'phone_e164' | 'batch_id' | 'created_at'>;

export type DuplicatePair = { a: Row; b: Row; similarity: number };

/** Pares de leads do workspace com nome parecido na mesma cidade, fora os que o Gabriel já separou. */
export async function listPossibleDuplicates(db: Db): Promise<DuplicatePair[]> {
  const [leads, dismissed] = await Promise.all([
    fetchAll<Row>((from, to) => db.from('leads').select(COLUMNS).order('id').range(from, to)),
    fetchAll<{ lead_a: string; lead_b: string }>((from, to) => db.from('lead_duplicate_dismissals').select('lead_a, lead_b').order('lead_a').range(from, to)),
  ]);
  const skip = new Set(dismissed.map((d) => pairKey(d.lead_a, d.lead_b)));
  return possibleDuplicates(leads.filter((l) => l.stage !== 'descartado').map((l) => ({ ...l, ...keysOf(l) })), skip)
    .map(({ a, b, similarity }) => ({ a, b, similarity }));
}

/** "Não são o mesmo negócio": o par sai da lista. */
export async function dismissDuplicate(db: Db, a: string, b: string) {
  const [lead_a, lead_b] = a < b ? [a, b] : [b, a];
  const { error } = await db.from('lead_duplicate_dismissals').upsert({ lead_a, lead_b }, { onConflict: 'lead_a,lead_b', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Etapas em que o lead ainda não andou na pipeline. */
const EARLY = new Set(['analisando', 'revisar', 'descartado']);

async function hasConversation(db: Db, id: string): Promise<boolean> {
  const [contacts, clients] = await Promise.all([
    db.from('contacts').select('id').eq('lead_id', id).limit(1),
    db.from('clients').select('id').eq('lead_id', id).limit(1),
  ]);
  return !!(contacts.data?.length || clients.data?.length);
}

/**
 * Junta dois leads que são o mesmo negócio. Fica o que já andou mais (conversa ou cliente, depois etapa,
 * depois o mais antigo); ele ganha os dados que faltavam e os batches, eventos e materiais do outro.
 * Dois leads com conversa não se juntam aqui.
 */
export async function mergeLeads(db: Db, aId: string, bId: string): Promise<{ kept: string; removed: string }> {
  const [a, b] = await getLeadsByIds(db, [aId, bId]).then((ls) => [ls.find((l) => l.id === aId), ls.find((l) => l.id === bId)]);
  if (!a || !b) throw new Error('Um dos leads não existe mais.');
  const [convA, convB] = await Promise.all([hasConversation(db, a.id), hasConversation(db, b.id)]);
  if (convA && convB) throw new Error('Os dois leads já têm conversa ou cliente: junte pelo CRM.');
  const rank = (l: Lead, conv: boolean) => (conv ? 2 : EARLY.has(l.stage) ? 0 : 1);
  const [keep, drop] = rank(a, convA) !== rank(b, convB)
    ? (rank(a, convA) > rank(b, convB) ? [a, b] : [b, a])
    : (a.created_at <= b.created_at ? [a, b] : [b, a]);

  const patch = mergeIncoming(keep, { ...drop, batch_id: drop.batch_id ?? '' } as unknown as NewLead);
  // O place_id é único por workspace: sai do que vai ser apagado antes de passar para o que fica.
  if (patch.place_id) await updateLead(db, drop.id, { place_id: null });
  // O responsável do que sai só vale se o que fica não tem um.
  if (!keep.responsible_id && drop.responsible_id) patch.responsible_id = drop.responsible_id;
  if (Object.keys(patch).length) await updateLead(db, keep.id, patch);

  const { data: links } = await db.from('batch_leads').select('batch_id, found_at, already_known').eq('lead_id', drop.id);
  for (const l of (links ?? []) as { batch_id: string; found_at: string; already_known: boolean }[]) {
    await db.from('batch_leads').upsert({ ...l, lead_id: keep.id }, { onConflict: 'batch_id,lead_id', ignoreDuplicates: true });
  }
  for (const table of ['events', 'lead_assets', 'pages']) await db.from(table).update({ lead_id: keep.id }).eq('lead_id', drop.id);
  const { error } = await db.from('leads').delete().eq('id', drop.id);
  if (error) throw new Error(`Falha ao juntar: ${error.message}`);
  await logEvent(db, keep.id, 'juntado', { removido: drop.id, nome: drop.name });
  return { kept: keep.id, removed: drop.id };
}
