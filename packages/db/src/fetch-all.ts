const PAGE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

/** O Supabase devolve no máximo 1000 linhas por consulta. Isto lê todas as páginas. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}
