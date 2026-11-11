/** Mantém a primeira URL assinada de cada arquivo, para o player não reiniciar a cada refresh. */
export function createUrlCache(ttlMs: number) {
  const map = new Map<string, { url: string; at: number }>();
  return {
    resolve(path: string, fresh: string | null | undefined, now = Date.now()): string | null {
      const hit = map.get(path);
      if (hit && now - hit.at < ttlMs) return hit.url;
      if (!fresh) return hit?.url ?? null;
      map.set(path, { url: fresh, at: now });
      return fresh;
    },
  };
}
