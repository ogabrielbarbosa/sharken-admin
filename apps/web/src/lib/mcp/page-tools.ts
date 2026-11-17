import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  LEAD_NOT_FOUND,
  listPages,
  MAX_PAGE_HTML,
  mcpGetLead,
  PAGE_NOT_FOUND,
  pageUrl,
  publishPage,
  scopeDb,
  setPageExpiration,
  workspaceFilter,
  type Access,
  type Db,
  type Page,
} from '@lps/db';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
/** `readDb` é o cliente só de leitura (para conferir acesso); `writeDb`, o admin, usado só preso a um workspace. */
type Ctx = { readDb: Db; writeDb: Db; access: Access };

const KNOWN = new Set([LEAD_NOT_FOUND, PAGE_NOT_FOUND, 'O HTML está vazio.']);
const ok = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

function safe<A>(fn: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (KNOWN.has(message) || message.startsWith('O HTML passou')) return fail(message);
      console.error('Erro numa ferramenta de página do MCP:', e);
      return fail('Erro ao publicar a página.');
    }
  };
}

const uuid = z.uuid();
const pageId = z.string().regex(/^[A-Za-z0-9]{6,32}$/, 'id de página inválido');
const hours = z.number().positive().max(24 * 365).nullable().optional()
  .describe('horas até expirar a partir de agora (ex.: 24); null = não expira');

const pageView = (p: Page) => ({
  id: p.id, url: pageUrl(p.id), lead_id: p.lead_id, title: p.title,
  expires_at: p.expires_at, expirada: !!p.expires_at && new Date(p.expires_at).getTime() <= Date.now(),
  created_at: p.created_at, updated_at: p.updated_at,
});

/** Workspace da página entre os acessíveis (o admin da plataforma vê todos). */
async function pageWorkspace(db: Db, access: Access, id: string): Promise<string | null> {
  const ids = workspaceFilter(access);
  if (!ids.length) return null;
  const { data, error } = await db.from('pages').select('workspace_id').in('workspace_id', ids).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { workspace_id: string } | null)?.workspace_id ?? null;
}

/** As únicas ferramentas que gravam: publicar a página de um lead e mudar a expiração dela. */
export function registerPageTools(server: McpServer, { readDb, writeDb, access }: Ctx): void {
  server.registerTool('publicar_pagina', {
    title: 'Publicar página do lead',
    description:
      'Publica um HTML completo (documento único, CSS/JS embutidos ou de CDN, imagens por link) como a página do lead em ' +
      'pages.sharkenapps.com/<id>, grava o link no lead (Página passa para Vídeo no quadro) e devolve o link. ' +
      'Para corrigir uma página já publicada, passe `pagina_id`: o link continua o mesmo. ' +
      `Limite de ${MAX_PAGE_HTML.toLocaleString('pt-BR')} caracteres; não embuta imagens em base64, use os links permanentes de ver_imagens_do_lead.`,
    inputSchema: z.object({
      lead_id: z.string(),
      html: z.string().min(1),
      titulo: z.string().max(200).optional(),
      expira_em_horas: hours,
      pagina_id: pageId.optional().describe('id de uma página já publicada, para trocar o HTML mantendo o link'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, safe(async ({ lead_id, html, titulo, expira_em_horas, pagina_id }) => {
    if (!uuid.safeParse(lead_id).success) return fail(LEAD_NOT_FOUND);
    const found = await mcpGetLead(readDb, access, lead_id);
    if (!found) return fail(LEAD_NOT_FOUND);
    const workspaceId = (found.lead as typeof found.lead & { workspace_id: string }).workspace_id;
    const { page, url } = await publishPage(scopeDb(writeDb, workspaceId), {
      leadId: lead_id, html, title: titulo, expiresInHours: expira_em_horas, pageId: pagina_id, userId: access.userId,
    });
    return ok({
      url,
      pagina: pageView(page),
      lead: found.lead.name,
      aviso: page.expires_at ? `Expira em ${page.expires_at}.` : 'Não expira.',
    });
  }));

  server.registerTool('alterar_expiracao_da_pagina', {
    title: 'Alterar expiração da página',
    description: 'Define quando a página expira, em horas a partir de agora, ou `null` para não expirar. Também reabre uma página expirada.',
    inputSchema: z.object({ pagina_id: pageId, expira_em_horas: z.number().positive().max(24 * 365).nullable() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, safe(async ({ pagina_id, expira_em_horas }) => {
    const ws = await pageWorkspace(readDb, access, pagina_id);
    if (!ws) return fail(PAGE_NOT_FOUND);
    return ok(pageView(await setPageExpiration(scopeDb(writeDb, ws), pagina_id, expira_em_horas)));
  }));

  server.registerTool('listar_paginas', {
    title: 'Listar páginas publicadas',
    description: 'Páginas publicadas (link, lead, título, expiração), da mais nova para a mais antiga. Filtra por lead ou workspace.',
    inputSchema: z.object({
      lead_id: z.string().optional(),
      workspace: z.string().optional().describe('id ou slug do workspace'),
      limite: z.number().int().min(1).max(200).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, safe(async ({ lead_id, workspace, limite }) => {
    if (lead_id && !uuid.safeParse(lead_id).success) return ok([]);
    const all: Page[] = [];
    for (const ws of workspaceFilter(access, workspace)) all.push(...(await listPages(scopeDb(readDb, ws), { leadId: lead_id, limit: limite })));
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ok(all.slice(0, limite ?? 50).map(pageView));
  }));
}
