import type { Lead } from '@lps/domain';
import type { Db } from './client';
import { getLead, moveLead, updateLead } from './leads';
import { requireWorkspace } from './scope';

export type Page = {
  id: string;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  lead_id: string | null;
  title: string | null;
  expires_at: string | null;
  created_by: string | null;
};

/** O corpo de uma requisição na Vercel vai até 4,5 MB; o HTML fica bem abaixo disso. */
export const MAX_PAGE_HTML = 2_000_000;
export const PAGE_NOT_FOUND = 'Página não encontrada.';
export const LEAD_NOT_FOUND = 'Lead não encontrado.';

const PAGE_COLUMNS = 'id, created_at, updated_at, workspace_id, lead_id, title, expires_at, created_by';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Id curto e aleatório (10 caracteres sem os ambíguos 0/O/1/l/I): é o caminho público da página. */
export function newPageId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = '';
  for (const b of bytes) {
    // Descarta o que daria viés no módulo.
    if (b >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[b % ALPHABET.length];
    if (out.length === length) return out;
  }
  return out.length === length ? out : newPageId(length);
}

export const pagesBaseUrl = () => (process.env.PAGES_URL?.trim() || 'https://pages.sharkenapps.com').replace(/\/+$/, '');
export const pageUrl = (id: string) => `${pagesBaseUrl()}/${id}`;

/** Horas a partir de agora; null = não expira. */
export function expiresAt(hours: number | null | undefined, now = Date.now()): string | null {
  if (hours == null) return null;
  return new Date(now + hours * 3_600_000).toISOString();
}

function check<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** Grava o link no lead; quem está em Página passa para Vídeo, como ao colar o link no quadro. */
async function linkToLead(db: Db, lead: Lead, url: string) {
  if (lead.stage === 'pagina') await moveLead(db, lead, 'video', { page_url: url });
  else await updateLead(db, lead.id, { page_url: url });
}

/**
 * Publica (ou, com `pageId`, troca o HTML de) uma página do lead e grava o link nele.
 * `db` precisa estar preso ao workspace (scopeDb). `expiresInHours` undefined mantém a expiração atual
 * ao republicar e, numa página nova, não expira.
 */
export async function publishPage(
  db: Db,
  o: { leadId: string; html: string; title?: string | null; expiresInHours?: number | null; pageId?: string; userId?: string },
): Promise<{ page: Page; url: string }> {
  const workspaceId = requireWorkspace(db);
  if (!o.html.trim()) throw new Error('O HTML está vazio.');
  if (o.html.length > MAX_PAGE_HTML) throw new Error(`O HTML passou de ${MAX_PAGE_HTML.toLocaleString('pt-BR')} caracteres. Use links para as imagens em vez de embuti-las.`);
  const lead = await getLead(db, o.leadId);
  if (!lead) throw new Error(LEAD_NOT_FOUND);

  let page: Page;
  if (o.pageId) {
    const current = check<Page | null>(await db.from('pages').select(PAGE_COLUMNS).eq('id', o.pageId).maybeSingle());
    if (!current) throw new Error(PAGE_NOT_FOUND);
    const patch: Record<string, unknown> = { html: o.html, lead_id: lead.id, updated_at: new Date().toISOString() };
    if (o.title !== undefined) patch.title = o.title;
    if (o.expiresInHours !== undefined) patch.expires_at = expiresAt(o.expiresInHours);
    page = check<Page>(await db.from('pages').update(patch).eq('id', o.pageId).select(PAGE_COLUMNS).single());
  } else {
    page = check<Page>(await db.from('pages').insert({
      id: newPageId(),
      workspace_id: workspaceId,
      lead_id: lead.id,
      title: o.title ?? null,
      html: o.html,
      expires_at: expiresAt(o.expiresInHours),
      created_by: o.userId ?? null,
    }).select(PAGE_COLUMNS).single());
  }
  const url = pageUrl(page.id);
  await linkToLead(db, lead, url);
  return { page, url };
}

/** Muda a expiração: horas a partir de agora, ou null para não expirar. */
export async function setPageExpiration(db: Db, pageId: string, hours: number | null): Promise<Page> {
  const page = check<Page | null>(await db.from('pages')
    .update({ expires_at: expiresAt(hours), updated_at: new Date().toISOString() })
    .eq('id', pageId).select(PAGE_COLUMNS).maybeSingle());
  if (!page) throw new Error(PAGE_NOT_FOUND);
  return page;
}

export async function listPages(db: Db, o: { leadId?: string; limit?: number } = {}): Promise<Page[]> {
  let query = db.from('pages').select(PAGE_COLUMNS);
  if (o.leadId) query = query.eq('lead_id', o.leadId);
  return check<Page[]>(await query.order('created_at', { ascending: false }).limit(Math.min(Math.max(o.limit ?? 50, 1), 200)));
}

export const isExpired = (page: Pick<Page, 'expires_at'>, now = Date.now()) =>
  !!page.expires_at && new Date(page.expires_at).getTime() <= now;

/** Leitura pública (sem workspace): o HTML, ou se expirou, ou null. */
export async function getPublicPage(db: Db, id: string): Promise<{ html: string; expired: boolean } | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(id)) return null;
  const row = check<{ html: string; expires_at: string | null } | null>(await db.from('pages').select('html, expires_at').eq('id', id).maybeSingle());
  if (!row) return null;
  return isExpired(row) ? { html: '', expired: true } : { html: row.html, expired: false };
}
