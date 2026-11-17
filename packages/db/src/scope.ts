import type { Db } from './client';

/** Tabelas da operação: cada linha pertence a um workspace. `do_not_contact` é global de propósito. */
export const WORKSPACE_TABLES = new Set([
  'batches', 'leads', 'sites', 'videos', 'lead_assets', 'events', 'contacts', 'messages',
  'clients', 'services', 'contracts', 'charges', 'jobs', 'whatsapp_connection',
]);

const WORKSPACE = Symbol('workspace');

type Row = Record<string, unknown>;
const withWorkspace = (rows: unknown, ws: string) =>
  Array.isArray(rows) ? rows.map((r: Row) => ({ ...r, workspace_id: ws })) : { ...(rows as Row), workspace_id: ws };
const withoutWorkspace = (patch: unknown) => {
  const { workspace_id: _ignored, ...rest } = patch as Row;
  return rest;
};

/**
 * Cliente preso a um workspace: toda leitura, alteração e exclusão nas tabelas da operação filtra pelo
 * workspace, e toda inserção grava nele. O resto (storage, rpc, tabelas globais) passa direto.
 * As funções do banco (rpc) recebem o workspace por parâmetro: use `workspaceOf(db)`.
 */
export function scopeDb(db: Db, workspaceId: string): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === WORKSPACE) return workspaceId;
      if (prop === 'from') {
        return (table: string) => {
          const query = target.from(table);
          if (!WORKSPACE_TABLES.has(table)) return query;
          return new Proxy(query, {
            get(q, p) {
              const original = Reflect.get(q, p, q);
              if (typeof original !== 'function') return original;
              if (p === 'select') return (...args: unknown[]) => original.apply(q, args).eq('workspace_id', workspaceId);
              if (p === 'delete') return (...args: unknown[]) => original.apply(q, args).eq('workspace_id', workspaceId);
              if (p === 'update') return (patch: unknown, ...rest: unknown[]) => original.call(q, withoutWorkspace(patch), ...rest).eq('workspace_id', workspaceId);
              if (p === 'insert' || p === 'upsert') return (rows: unknown, ...rest: unknown[]) => original.call(q, withWorkspace(rows, workspaceId), ...rest);
              return original.bind(q);
            },
          });
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Workspace do cliente criado por scopeDb; null no cliente sem escopo (worker, webhooks, scripts). */
export function workspaceOf(db: Db): string | null {
  return ((db as unknown as Record<symbol, string | undefined>)[WORKSPACE]) ?? null;
}

/** Igual a workspaceOf, mas falha quando não há workspace: para o que só faz sentido dentro de um. */
export function requireWorkspace(db: Db): string {
  const ws = workspaceOf(db);
  if (!ws) throw new Error('Operação sem workspace.');
  return ws;
}

export type Workspace = { id: string; name: string; slug: string; role: 'owner' | 'member' };

export async function listUserWorkspaces(db: Db, userId: string): Promise<Workspace[]> {
  const { data, error } = await db
    .from('workspace_members')
    .select('role, workspaces (id, name, slug, created_at)')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { role: Workspace['role']; workspaces: Omit<Workspace, 'role'> & { created_at: string } }[])
    .filter((m) => m.workspaces)
    .sort((a, b) => a.workspaces.created_at.localeCompare(b.workspaces.created_at))
    .map((m) => ({ id: m.workspaces.id, name: m.workspaces.name, slug: m.workspaces.slug, role: m.role }));
}

/** Workspace dono da instância da Evolution (o webhook chega só com o nome da instância). */
export async function workspaceByInstance(db: Db, instance: string): Promise<string | null> {
  const { data, error } = await db.from('whatsapp_connection').select('workspace_id').eq('instance', instance).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { workspace_id: string } | null)?.workspace_id ?? null;
}

/** Workspace de um registro qualquer da operação (ex.: o batch do webhook do Apify). */
export async function workspaceOfRow(db: Db, table: string, id: string): Promise<string | null> {
  const { data, error } = await db.from(table).select('workspace_id').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { workspace_id: string } | null)?.workspace_id ?? null;
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'workspace';
}
