import type { Db } from './client';

export const READ_ONLY_ERROR = 'MCP é somente leitura.';

const BLOCKED_QUERY = new Set(['insert', 'update', 'upsert', 'delete']);
const ALLOWED_STORAGE = new Set(['createSignedUrl', 'createSignedUrls', 'download']);

const blocked = () => {
  throw new Error(READ_ONLY_ERROR);
};

/** Cliente que só lê: escrita nas tabelas, rpc e storage (fora URL assinada e download) lançam erro. */
export function readOnlyDb(db: Db): Db {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'rpc') return blocked;
      if (prop === 'from') {
        return (table: string) => {
          const query = target.from(table);
          return new Proxy(query, {
            get(q, p) {
              if (typeof p === 'string' && BLOCKED_QUERY.has(p)) return blocked;
              const value = Reflect.get(q, p, q);
              return typeof value === 'function' ? value.bind(q) : value;
            },
          });
        };
      }
      if (prop === 'storage') {
        const storage = target.storage;
        return new Proxy(storage, {
          get(s, p) {
            if (p !== 'from') {
              const v = Reflect.get(s, p, s);
              return typeof v === 'function' ? v.bind(s) : v;
            }
            return (bucket: string) =>
              new Proxy(s.from(bucket), {
                get(b, bp) {
                  const v = Reflect.get(b, bp, b);
                  if (typeof v !== 'function') return v;
                  return typeof bp === 'string' && ALLOWED_STORAGE.has(bp) ? v.bind(b) : blocked;
                },
              });
          },
        });
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
