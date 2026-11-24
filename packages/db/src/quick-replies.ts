import type { QuickReplyFields } from '@lps/domain';
import type { Db } from './client';

export type QuickReplyRecord = QuickReplyFields & { id: string; position: number; active: boolean };

type DbError = { message: string; code?: string } | null;
const check = (error: DbError) => {
  if (error?.code === '23505') throw new Error('Já existe uma mensagem com esse atalho.');
  if (error) throw new Error(error.message);
};

export async function listQuickReplies(db: Db, opts: { onlyActive?: boolean } = {}): Promise<QuickReplyRecord[]> {
  let q = db.from('quick_replies').select().order('position').order('created_at');
  if (opts.onlyActive) q = q.eq('active', true);
  const { data, error } = await q;
  check(error);
  return (data ?? []) as QuickReplyRecord[];
}

const nextPosition = (items: QuickReplyRecord[]) => items.reduce((max, r) => Math.max(max, r.position + 1), 0);

/** Entra no fim da lista. */
export async function createQuickReply(db: Db, fields: QuickReplyFields) {
  const position = nextPosition(await listQuickReplies(db));
  check((await db.from('quick_replies').insert({ ...fields, position })).error);
}

export async function updateQuickReply(db: Db, id: string, patch: Partial<QuickReplyFields & { active: boolean }>) {
  const { data, error } = await db.from('quick_replies').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('id');
  check(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Essa mensagem não existe mais. Atualize a página.');
}

export async function deleteQuickReply(db: Db, id: string) {
  check((await db.from('quick_replies').delete().eq('id', id)).error);
}

/** Grava a ordem dada. Id de outro workspace ou já excluído é ignorado pelo filtro. */
export async function reorderQuickReplies(db: Db, ids: string[]) {
  const results = await Promise.all(ids.map((id, position) => db.from('quick_replies').update({ position }).eq('id', id)));
  results.forEach((r) => check(r.error));
}

/** Acrescenta as mensagens padrão cujo atalho ainda não existe; não mexe nas que já estão lá. Devolve quantas entraram. */
export async function addDefaultQuickReplies(db: Db, defaults: QuickReplyFields[]): Promise<number> {
  const current = await listQuickReplies(db);
  const missing = defaults.filter((d) => !current.some((c) => c.shortcut === d.shortcut));
  const start = nextPosition(current);
  if (missing.length) check((await db.from('quick_replies').insert(missing.map((d, i) => ({ ...d, position: start + i })))).error);
  return missing.length;
}
