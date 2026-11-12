/** Link do lead dentro do quadro: mantém os filtros e abre o modal em `?lead=`. Fica fora do `board.tsx` (cliente) para o servidor também usar. */
export function boardHref(batchId: string, query: string, leadId: string | null): string {
  const qs = new URLSearchParams(query);
  if (leadId) qs.set('lead', leadId);
  const text = qs.toString();
  return `/painel/batches/${batchId}${text ? `?${text}` : ''}`;
}
