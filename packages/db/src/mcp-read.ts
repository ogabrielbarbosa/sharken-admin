import {
  columnOf,
  PIPELINE_COLUMNS,
  type Batch,
  type BatchStatus,
  type ChatState,
  type Contact,
  type ContactStatus,
  type Flow,
  type Lead,
  type LeadAsset,
  type LeadStage,
  type Message,
  type PipelineColumn,
} from '@lps/domain';
import type { Db } from './client';
import { fetchAll } from './fetch-all';
import type { Workspace } from './scope';

/**
 * Leituras do MCP. Recebem o cliente sem `scopeDb` (já passado por `readOnlyDb`) e filtram cada consulta,
 * explicitamente, pelos workspaces a que o usuário tem acesso. Nunca leem cobrança, convites, jobs nem clientes.
 */
export type Access = { userId: string; isAdmin: boolean; workspaces: Pick<Workspace, 'id' | 'name' | 'slug' | 'role'>[] };

export type LeadSummary = {
  id: string;
  workspace: string;
  batch_id: string | null;
  name: string;
  column: PipelineColumn;
  stage: LeadStage;
  flow: Flow | null;
  score: number | null;
  city: string | null;
  business_type: string | null;
  phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  has_instagram_media: boolean;
  page_url: string | null;
  loom_url: string | null;
  contacts: number;
  stage_changed_at: string;
};

const LIST_LIMIT = 50;
const LIST_MAX = 200;
const MESSAGES_LIMIT = 100;
const MESSAGES_MAX = 500;
/** Listas de ids no `in` vão em pedaços para a URL da REST não estourar (uuid ~37 bytes; 100 ≈ 4 KB). */
const IN_CHUNK = 100;

const SUMMARY_COLUMNS =
  'id, workspace_id, batch_id, name, stage, flow, score, city, business_type, phone_e164, phone_raw, website_url, instagram_url, instagram_media, page_url, loom_url, stage_changed_at';

type SummaryRow = Pick<Lead, 'id' | 'batch_id' | 'name' | 'stage' | 'flow' | 'score' | 'city' | 'business_type' | 'phone_e164' | 'phone_raw' | 'website_url' | 'instagram_url' | 'instagram_media' | 'page_url' | 'loom_url' | 'stage_changed_at'> & { workspace_id: string };

/** Restringe ao workspace pedido (id ou slug) ou devolve todos os acessíveis; pedido fora do acesso → []. */
export function workspaceFilter(access: Access, workspace?: string): string[] {
  if (!workspace) return access.workspaces.map((w) => w.id);
  return access.workspaces.filter((w) => w.id === workspace || w.slug === workspace).map((w) => w.id);
}

const nameOf = (access: Access, workspaceId: string) => access.workspaces.find((w) => w.id === workspaceId)?.name ?? workspaceId;

const clamp = (n: number | undefined, fallback: number, max: number) =>
  Math.min(Math.max(1, Math.floor(n ?? fallback)), max);

const encodeCursor = (offset: number) => btoa(`o:${offset}`);
function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  let text = '';
  try {
    text = atob(cursor);
  } catch {
    // cai no erro abaixo
  }
  const n = text.startsWith('o:') ? Number(text.slice(2)) : NaN;
  if (!Number.isInteger(n) || n < 0) throw new Error('Cursor inválido.');
  return n;
}

/** Pede uma linha a mais para saber se há próxima página. */
function page<T>(rows: T[], offset: number, limit: number): { items: T[]; next: string | null } {
  return { items: rows.slice(0, limit), next: rows.length > limit ? encodeCursor(offset + limit) : null };
}

const emptyColumns = <T>(make: () => T) =>
  Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c.key, make()])) as Record<PipelineColumn, T>;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_CHUNK) out.push(items.slice(i, i + IN_CHUNK));
  return out;
}

function check<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Quantos contatos cada lead tem, só nos workspaces acessíveis. */
async function contactCounts(db: Db, ids: string[], leadIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const part of chunks(leadIds)) {
    const rows = check<{ lead_id: string }[]>(await db.from('contacts').select('lead_id').in('workspace_id', ids).in('lead_id', part));
    for (const r of rows) counts.set(r.lead_id, (counts.get(r.lead_id) ?? 0) + 1);
  }
  return counts;
}

async function summarize(db: Db, access: Access, ids: string[], rows: SummaryRow[]): Promise<LeadSummary[]> {
  const counts = await contactCounts(db, ids, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    workspace: nameOf(access, r.workspace_id),
    batch_id: r.batch_id,
    name: r.name,
    column: columnOf(r.stage),
    stage: r.stage,
    flow: r.flow,
    score: r.score,
    city: r.city,
    business_type: r.business_type,
    phone: r.phone_e164 ?? r.phone_raw,
    website_url: r.website_url,
    instagram_url: r.instagram_url,
    has_instagram_media: (r.instagram_media?.length ?? 0) > 0,
    page_url: r.page_url,
    loom_url: r.loom_url,
    contacts: counts.get(r.id) ?? 0,
    stage_changed_at: r.stage_changed_at,
  }));
}

/** Vírgula, parênteses e curingas têm sentido na sintaxe do filtro; saem da busca. */
const cleanSearch = (s?: string) => s?.replace(/[,()%*"\\]/g, ' ').trim();

export async function mcpListBatches(
  db: Db,
  access: Access,
  o: { workspace?: string; status?: BatchStatus; limit?: number },
): Promise<(Batch & { workspace: string; columns: Record<PipelineColumn, number> })[]> {
  const ids = workspaceFilter(access, o.workspace);
  if (!ids.length) return [];
  let query = db.from('batches').select('*').in('workspace_id', ids);
  if (o.status) query = query.eq('status', o.status);
  const batches = check<Batch[]>(await query.order('created_at', { ascending: false }).limit(clamp(o.limit, LIST_LIMIT, LIST_MAX)));
  if (!batches.length) return [];

  const columns = new Map(batches.map((b) => [b.id, emptyColumns(() => 0)]));
  for (const part of chunks(batches.map((b) => b.id))) {
    const stages = await fetchAll<{ batch_id: string; stage: LeadStage }>((from, to) =>
      db.from('leads').select('batch_id, stage').in('workspace_id', ids).in('batch_id', part).order('id').range(from, to),
    );
    for (const s of stages) columns.get(s.batch_id)![columnOf(s.stage)] += 1;
  }
  return batches.map((b) => ({ ...b, workspace: nameOf(access, b.workspace_id), columns: columns.get(b.id)! }));
}

export async function mcpGetBatch(
  db: Db,
  access: Access,
  batchId: string,
): Promise<{ batch: Batch & { workspace: string }; columns: Record<PipelineColumn, LeadSummary[]> } | null> {
  const ids = workspaceFilter(access);
  if (!ids.length) return null;
  const batch = check<Batch | null>(await db.from('batches').select('*').in('workspace_id', ids).eq('id', batchId).maybeSingle());
  if (!batch) return null;
  const rows = await fetchAll<SummaryRow>((from, to) =>
    db.from('leads').select(SUMMARY_COLUMNS).in('workspace_id', ids).eq('batch_id', batchId)
      .order('score', { ascending: false, nullsFirst: false }).order('id').range(from, to),
  );
  const columns = emptyColumns<LeadSummary[]>(() => []);
  for (const lead of await summarize(db, access, ids, rows)) columns[lead.column].push(lead);
  return { batch: { ...batch, workspace: nameOf(access, batch.workspace_id) }, columns };
}

export async function mcpListLeads(
  db: Db,
  access: Access,
  o: { batchId?: string; column?: PipelineColumn; workspace?: string; search?: string; limit?: number; cursor?: string },
): Promise<{ leads: LeadSummary[]; next: string | null }> {
  const ids = workspaceFilter(access, o.workspace);
  if (!ids.length) return { leads: [], next: null };
  const limit = clamp(o.limit, LIST_LIMIT, LIST_MAX);
  const offset = decodeCursor(o.cursor);
  let query = db.from('leads').select(SUMMARY_COLUMNS).in('workspace_id', ids);
  if (o.batchId) query = query.eq('batch_id', o.batchId);
  if (o.column) query = query.in('stage', PIPELINE_COLUMNS.find((c) => c.key === o.column)?.stages ?? []);
  const term = cleanSearch(o.search);
  if (term) query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
  const rows = check<SummaryRow[]>(await query
    .order('score', { ascending: false, nullsFirst: false }).order('id').range(offset, offset + limit));
  const { items, next } = page(rows, offset, limit);
  return { leads: await summarize(db, access, ids, items), next };
}

export async function mcpGetLead(
  db: Db,
  access: Access,
  leadId: string,
): Promise<{ lead: Lead; workspace: string; assets: LeadAsset[]; contacts: Contact[] } | null> {
  const ids = workspaceFilter(access);
  if (!ids.length) return null;
  const lead = check<(Lead & { workspace_id: string }) | null>(await db.from('leads').select('*').in('workspace_id', ids).eq('id', leadId).maybeSingle());
  if (!lead) return null;
  const assets = check<LeadAsset[]>(await db.from('lead_assets').select('*').in('workspace_id', ids).eq('lead_id', leadId).eq('status', 'pronto').order('created_at'));
  const contacts = check<Contact[]>(await db.from('contacts').select('*').in('workspace_id', ids).eq('lead_id', leadId).order('created_at'));
  return { lead, workspace: nameOf(access, lead.workspace_id), assets, contacts };
}

export async function mcpListChats(
  db: Db,
  access: Access,
  o: { workspace?: string; state?: ChatState; status?: ContactStatus; batchId?: string; limit?: number; cursor?: string },
): Promise<{ chats: (Contact & { workspace: string; lead: { id: string; name: string } | null })[]; next: string | null }> {
  const ids = workspaceFilter(access, o.workspace);
  if (!ids.length) return { chats: [], next: null };
  const limit = clamp(o.limit, LIST_LIMIT, LIST_MAX);
  const offset = decodeCursor(o.cursor);
  let query = db.from('contacts').select('*').in('workspace_id', ids);
  if (o.state) query = query.eq('chat_state', o.state);
  if (o.status) query = query.eq('status', o.status);
  if (o.batchId) query = query.eq('batch_id', o.batchId);
  const rows = check<(Contact & { workspace_id: string })[]>(await query
    .order('last_message_at', { ascending: false, nullsFirst: false }).order('id').range(offset, offset + limit));
  const { items, next } = page(rows, offset, limit);

  const leadIds = [...new Set(items.map((c) => c.lead_id).filter((id): id is string => !!id))];
  const leads = new Map<string, { id: string; name: string }>();
  for (const part of chunks(leadIds)) {
    for (const l of check<{ id: string; name: string }[]>(await db.from('leads').select('id, name').in('workspace_id', ids).in('id', part))) {
      leads.set(l.id, { id: l.id, name: l.name });
    }
  }
  return {
    chats: items.map((c) => ({ ...c, workspace: nameOf(access, c.workspace_id), lead: (c.lead_id && leads.get(c.lead_id)) || null })),
    next,
  };
}

export async function mcpGetChat(
  db: Db,
  access: Access,
  contactId: string,
  limit?: number,
): Promise<{ contact: Contact; workspace: string; lead: LeadSummary | null; messages: Message[] } | null> {
  const ids = workspaceFilter(access);
  if (!ids.length) return null;
  const contact = check<(Contact & { workspace_id: string }) | null>(await db.from('contacts').select('*').in('workspace_id', ids).eq('id', contactId).maybeSingle());
  if (!contact) return null;
  // As N mais recentes, devolvidas em ordem cronológica (notas internas incluídas).
  const recent = check<Message[]>(await db.from('messages').select('*').in('workspace_id', ids).eq('contact_id', contactId)
    .order('at', { ascending: false }).order('id').limit(clamp(limit, MESSAGES_LIMIT, MESSAGES_MAX)));
  let lead: LeadSummary | null = null;
  if (contact.lead_id) {
    const row = check<SummaryRow | null>(await db.from('leads').select(SUMMARY_COLUMNS).in('workspace_id', ids).eq('id', contact.lead_id).maybeSingle());
    if (row) [lead] = await summarize(db, access, ids, [row]);
  }
  return { contact, workspace: nameOf(access, contact.workspace_id), lead, messages: recent.reverse() };
}
