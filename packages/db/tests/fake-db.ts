import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '../src/client';
import { WORKSPACE_TABLES } from '../src/scope';

type Filter = [string, string, unknown];

/** Cliente mínimo com a forma do supabase-js, executando em PGlite. */
export function fakeDb(pg: PGlite): Db {
  // Colunas de array (text[]) vão como array; as demais, como JSON (jsonb).
  const arrayCache = new Map<string, Set<string>>();
  const arrayColumns = async (table: string) => {
    if (!arrayCache.has(table)) {
      const { rows } = await pg.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and data_type = 'ARRAY'`, [table]);
      arrayCache.set(table, new Set(rows.map((r) => r.column_name)));
    }
    return arrayCache.get(table)!;
  };
  const builder = (table: string) => {
    const s = {
      op: 'select',
      values: {} as Record<string, unknown>,
      filters: [] as Filter[],
      ors: [] as string[],
      order: [] as string[],
      single: false,
      limit: 0,
      offset: 0,
      head: false,
      conflict: null as { column: string; ignore: boolean } | null,
    };
    const run = async (): Promise<{ data: unknown; error: unknown; count?: number }> => {
      // Várias linhas de uma vez: uma inserção por linha.
      if ((s.op === 'insert' || s.op === 'upsert') && Array.isArray(s.values)) {
        const all = s.values as Record<string, unknown>[];
        const out: unknown[] = [];
        for (const row of all) {
          s.values = row;
          const r = await run();
          if (r.error) return r;
          out.push(...(r.data as unknown[]));
        }
        s.values = all as unknown as Record<string, unknown>;
        return { data: out, error: null };
      }
      const arrayCols = await arrayColumns(table);
      // Sem scopeDb, grava no workspace padrão (o da operação do Gabriel), como o painel faria.
      if ((s.op === 'insert' || s.op === 'upsert') && WORKSPACE_TABLES.has(table) && table !== 'jobs' && !('workspace_id' in s.values)) {
        const { rows } = await pg.query(`select id from workspaces where slug = 'sharken'`);
        s.values = { ...s.values, workspace_id: (rows[0] as { id: string }).id };
      }
      const params: unknown[] = [];
      const p = (v: unknown) => (params.push(v), `$${params.length}`);
      const conds = s.filters.map(([c, k, v]) => (k === 'in' ? `${c} = any(${p(v)})` : k === 'is' ? `${c} is ${v === null ? 'null' : String(v)}` : k === 'isnot' ? `${c} is not ${v === null ? 'null' : String(v)}` : `${c} ${k} ${p(v)}`));
      for (const expr of s.ors) {
        // Só o formato `coluna.ilike.valor,coluna.ilike.valor` usado pela busca.
        conds.push('(' + expr.split(',').map((part) => {
          const [col, op, ...rest] = part.split('.');
          return `${col} ${op === 'eq' ? '=' : op} ${p(rest.join('.'))}`;
        }).join(' or ') + ')');
      }
      const where = conds.length ? ' where ' + conds.join(' and ') : '';
      const enc = (v: unknown, col?: string) => (col && arrayCols.has(col) ? v : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
      const keys = Object.keys(s.values);
      let sql: string;
      if (s.op === 'insert' || s.op === 'upsert') {
        const onConflict = s.conflict ? (s.conflict.ignore || !keys.filter((k) => k !== s.conflict!.column).length ? ` on conflict (${s.conflict.column}) do nothing` : ` on conflict (${s.conflict.column}) do update set ${keys.filter((k) => k !== s.conflict!.column).map((k) => `${k} = excluded.${k}`).join(',')}`) : '';
        sql = `insert into ${table} (${keys.join(',')}) values (${keys.map((k) => p(enc(s.values[k], k))).join(',')})${onConflict} returning *`;
      } else if (s.op === 'delete') sql = `delete from ${table}${where} returning *`;
      else if (s.op === 'update') sql = `update ${table} set ${keys.map((k) => `${k} = ${p(enc(s.values[k], k))}`).join(',')}${where} returning *`;
      else sql = `select * from ${table}${where}${s.order.length ? ' order by ' + s.order.join(', ') : ''}${s.limit ? ` limit ${s.limit}` : ''}${s.offset ? ` offset ${s.offset}` : ''}`;
      try {
        const { rows } = await pg.query(sql, params);
        if (s.head) return { data: null, count: rows.length, error: null };
        return { data: s.single ? (rows[0] ?? null) : rows, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
      }
    };
    const filter = (k: string) => (c: string, v: unknown) => (s.filters.push([c, k, v]), b);
    const b: Record<string, unknown> = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => ((s.head = !!o?.head), b),
      insert: (v: Record<string, unknown>) => ((s.op = 'insert'), (s.values = v), b),
      upsert: (v: Record<string, unknown>, o: { onConflict: string; ignoreDuplicates?: boolean }) => (
        (s.op = 'upsert'), (s.values = v), (s.conflict = { column: o.onConflict, ignore: !!o.ignoreDuplicates }), b
      ),
      update: (v: Record<string, unknown>) => ((s.op = 'update'), (s.values = v), b),
      delete: () => ((s.op = 'delete'), b),
      eq: filter('='),
      neq: filter('<>'),
      lt: filter('<'),
      lte: filter('<='),
      gte: filter('>='),
      in: filter('in'),
      is: filter('is'),
      not: (c: string, op: string, v: unknown) => (s.filters.push([c, op === 'is' ? 'isnot' : op, v]), b),
      or: (expr: string) => (s.ors.push(expr), b),
      order: (c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => (
        s.order.push(`${c} ${o.ascending === false ? 'desc' : 'asc'} nulls ${o.nullsFirst ? 'first' : 'last'}`), b
      ),
      limit: (n: number) => ((s.limit = n), b),
      range: (from: number, to: number) => ((s.offset = from), (s.limit = to - from + 1), b),
      single: () => ((s.single = true), b),
      maybeSingle: () => ((s.single = true), b),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return b;
  };
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const keys = Object.keys(args);
    try {
      const { rows } = await pg.query(`select * from ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')})`, keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      // Funções escalares voltam como uma linha com uma coluna; as de conjunto, como lista de valores.
      const cols = rows.length ? Object.keys(rows[0] as object) : [];
      const data = fn === 'crm_insert_message' ? rows : fn === 'close_deal' ? (rows[0] as Record<string, unknown>)[cols[0]] : fn === 'crm_box_counts' || fn === 'crm_chat_counts' ? (rows[0] as Record<string, unknown>)[cols[0]] : rows.map((r) => (r as Record<string, unknown>)[cols[0]]);
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };
  return { from: builder, rpc } as unknown as Db;
}
