import { requireOptional } from '@lps/config';

export async function searchStockPhotos(query: string, count: number): Promise<string[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(count));
  url.searchParams.set('orientation', 'square');
  const res = await fetch(url, { headers: { Authorization: requireOptional('PEXELS_API_KEY') } });
  if (!res.ok) throw new Error(`Pexels respondeu ${res.status}.`);
  const json = (await res.json()) as { photos: { src: { large: string } }[] };
  return json.photos.map((p) => p.src.large);
}
