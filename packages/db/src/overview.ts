import type { Flow, LeadStage, ResultRow } from '@lps/domain';
import type { Db } from './client';
import { fetchAll } from './fetch-all';

export type OverviewLead = { id: string; batch_id: string | null; stage: LeadStage; contacted_at: string | null; flow: Flow | null; business_type: string | null; batches: { location_key: string } | null };
export type OverviewEvent = { lead_id: string; type: string; created_at: string };

export function listOverviewLeads(db: Db): Promise<OverviewLead[]> {
  return fetchAll((from, to) =>
    db.from('leads').select('id, batch_id, stage, contacted_at, flow, business_type, batches(location_key)').order('id').range(from, to),
  ) as unknown as Promise<OverviewLead[]>;
}

export function listEventsSince(db: Db, since: Date): Promise<OverviewEvent[]> {
  return fetchAll((from, to) =>
    db.from('events').select('lead_id, type, created_at').gte('created_at', since.toISOString()).order('id').range(from, to),
  ) as Promise<OverviewEvent[]>;
}

/** Transforma os eventos de um período em uma linha por lead. */
export function rowsFromEvents(leads: OverviewLead[], events: OverviewEvent[]): ResultRow[] {
  const byLead = new Map<string, Set<string>>();
  for (const e of events) {
    if (!byLead.has(e.lead_id)) byLead.set(e.lead_id, new Set());
    byLead.get(e.lead_id)!.add(e.type);
  }
  return leads.flatMap((lead) => {
    const types = byLead.get(lead.id);
    if (!types) return [];
    return [{
      flow: lead.flow,
      business_type: lead.business_type,
      found: types.has('etapa_revisar'),
      advanced: types.has('etapa_completar'),
      approved: types.has('etapa_crm'),
      contacted: types.has('contato_enviado'),
      opened: types.has('abertura'),
      replied: types.has('mensagem_recebida'),
      sold: types.has('etapa_vendido'),
    }];
  });
}
