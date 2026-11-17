/** Destino pós-login: só caminho interno (começa com / e não com // nem /\), senão o painel. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/painel';
  return value;
}
