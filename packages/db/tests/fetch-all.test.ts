import { expect, it } from 'vitest';
import { fetchAll } from '../src/fetch-all';

it('busca todas as páginas até acabar', async () => {
  const data = Array.from({ length: 2500 }, (_, i) => i);
  const seen: number[] = [];
  const out = await fetchAll<number>(async (from, to) => {
    seen.push(from);
    return { data: data.slice(from, to + 1), error: null };
  });
  expect(out).toHaveLength(2500);
  expect(seen).toEqual([0, 1000, 2000]);
});
it('propaga erro da consulta', async () => {
  await expect(fetchAll(async () => ({ data: null, error: { message: 'falhou' } }))).rejects.toThrow('falhou');
});
