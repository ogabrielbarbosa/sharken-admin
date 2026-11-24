import type { Batch } from '@lps/domain';
import type { ProspectedRow } from '@/components/batches/new-batch-drawer';

/** Batches no formato do mapa do novo batch. */
export function prospectedRows(batches: Batch[], stages: { batch_id: string }[]): ProspectedRow[] {
  const leads = new Map<string, number>();
  for (const s of stages) leads.set(s.batch_id, (leads.get(s.batch_id) ?? 0) + 1);
  return batches.map((b) => ({ id: b.id, location: b.location, locations: b.locations, places: b.places, business_type: b.business_type, created_at: b.created_at, leads: leads.get(b.id) ?? 0 }));
}
