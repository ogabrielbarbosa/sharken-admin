/** Destino pós-login: só caminho interno e do mesmo site; qualquer outra coisa vira o painel. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/painel';
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return '/painel';
  try {
    if (new URL(value, 'http://x').origin !== 'http://x') return '/painel';
  } catch {
    return '/painel';
  }
  return value;
}
