import { COUNTRY_LANGUAGE } from './countries-data';
import { distanceKm, findMunicipio } from './municipios';

/** Cidade fora do Brasil, gravada no batch. `location` é "Cidade, Região, País" (o país em português). */
export type Place = { location: string; country: string; lat: number; lng: number };
export type WorldCity = Place & { name: string; region: string; countryName: string; pop: number };

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[,\s]+/g, ' ').trim();

/** País do batch (código ISO). Todas as cidades de um batch são do mesmo país; sem lugar gravado, é o Brasil. */
export const batchCountry = (b: { places?: Place[] | null }): string => b.places?.[0]?.country ?? 'BR';

/** Nome da cidade, sem região nem país: "Austin, Texas, Estados Unidos" → "Austin". */
export const cityName = (location: string) => findMunicipio(location)?.nome ?? location.split(',')[0];

/** Nome do país em inglês, que as buscas no Google Maps entendem melhor. */
export const countryNameEn = (country: string) => new Intl.DisplayNames('en', { type: 'region' }).of(country) ?? country;

export const countryLanguage = (country: string) => COUNTRY_LANGUAGE[country] ?? 'en';

type Row = WorldCity & { key: string; aliases: string[]; tail: string[] };
export type WorldIndex = { rows: Row[]; byLocation: Map<string, Row> };

/** Lê o arquivo de scripts/build-world-cities.mjs (já ordenado por população). */
export function parseWorldCities(tsv: string): WorldIndex {
  const byLocation = new Map<string, Row>();
  const rows = tsv.split('\n').filter(Boolean).map((line) => {
    const [location, aliases, code, country, lat, lng, pop] = line.split('|');
    const parts = location.split(', ');
    const name = parts[0];
    const region = parts.length > 2 ? parts.slice(1, -1).join(', ') : '';
    const countryName = parts.at(-1)!;
    const row: Row = {
      location, country, lat: Number(lat), lng: Number(lng), pop: Number(pop), name, region, countryName,
      key: normalize(name),
      aliases: aliases ? aliases.split(';') : [],
      tail: [...normalize(`${region} ${countryName}`).split(' '), code.toLowerCase(), country.toLowerCase()].filter(Boolean),
    };
    byLocation.set(location, row);
    return row;
  });
  return { rows, byLocation };
}

const toCity = ({ key: _k, aliases: _a, tail: _t, ...city }: Row): WorldCity => city;

/** Cidades do mundo (fora o Brasil). Aceita região e país depois do nome: "austin tx", "paris frança". */
export function searchWorldCities(index: WorldIndex, query: string, limit = 8): WorldCity[] {
  const text = normalize(query);
  if (text.length < 2) return [];
  const words = text.split(' ');
  const splits = words.map((_, i) => ({ head: words.slice(0, words.length - i).join(' '), tail: words.slice(words.length - i) }));
  const found: { row: Row; score: number }[] = [];
  for (const row of index.rows) {
    let score = -1;
    for (const { head, tail } of splits) {
      const exact = row.key === head || row.aliases.includes(head);
      // Nome incompleto só vale sem região depois: "san fran" acha, "san tx" não.
      if (!exact && (tail.length || !row.key.startsWith(head))) continue;
      if (!tail.every((t) => row.tail.some((w) => w.startsWith(t)))) continue;
      score = exact ? 0 : 1;
      break;
    }
    if (score >= 0) found.push({ row, score });
  }
  return found.sort((a, b) => a.score - b.score || b.row.pop - a.row.pop).slice(0, limit).map(({ row }) => toCity(row));
}

export function findWorldCity(index: WorldIndex, location: string): WorldCity | null {
  const row = index.byLocation.get(location);
  return row ? toCity(row) : null;
}

/** Cidades do mesmo país até `radiusKm`, da mais perto para a mais longe (sem a própria). */
export function worldCitiesNear(index: WorldIndex, location: string, radiusKm: number, limit = 40): (WorldCity & { km: number })[] {
  const center = index.byLocation.get(location);
  if (!center || radiusKm <= 0) return [];
  return index.rows
    .filter((r) => r.country === center.country && r !== center && Math.abs(r.lat - center.lat) < radiusKm / 110)
    .map((r) => ({ ...toCity(r), km: distanceKm(center, r) }))
    .filter((r) => r.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
