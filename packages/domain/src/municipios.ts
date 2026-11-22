import { MUNICIPIOS_RAW, UF_NOMES } from './municipios-data';

export type Municipio = { nome: string; uf: string; estado: string };
/** Com o ponto central do município (latitude e longitude). */
export type MunicipioGeo = Municipio & { lat: number; lng: number };

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let cache: (MunicipioGeo & { key: string })[] | null = null;
function all() {
  cache ??= MUNICIPIOS_RAW.split('\n').map((line) => {
    const [nome, uf, lat, lng] = line.split('|');
    return { nome, uf, estado: UF_NOMES[uf], key: normalize(nome), lat: Number(lat), lng: Number(lng) };
  });
  return cache;
}

/** Distância em linha reta, em km, entre dois pontos (fórmula de haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Coordenadas de um município salvo como "Cidade, UF". */
export function municipioGeo(location: string): MunicipioGeo | null {
  const m = findMunicipio(location);
  const found = m && all().find((x) => x.uf === m.uf && x.nome === m.nome);
  return found ? { nome: found.nome, uf: found.uf, estado: found.estado, lat: found.lat, lng: found.lng } : null;
}

/**
 * Cidades em volta de outra, até `radiusKm` em linha reta, da mais perto para a mais longe (sem a própria).
 * São José dos Campos com 30 km traz Jacareí, Caçapava, Monteiro Lobato...
 */
export function municipiosNear(location: string, radiusKm: number): (MunicipioGeo & { km: number })[] {
  const center = municipioGeo(location);
  if (!center || radiusKm <= 0) return [];
  return all()
    .filter((m) => !(m.nome === center.nome && m.uf === center.uf))
    .map((m) => ({ nome: m.nome, uf: m.uf, estado: m.estado, lat: m.lat, lng: m.lng, km: distanceKm(center, m) }))
    .filter((m) => m.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

/** Formato salvo no batch e mostrado na tela: "Campinas, SP". */
export function formatMunicipio(m: Pick<Municipio, 'nome' | 'uf'>): string {
  return `${m.nome}, ${m.uf}`;
}

/** Devolve o município só se o texto for exatamente "Nome, UF" de um município do IBGE. */
export function findMunicipio(location: string): Municipio | null {
  const match = /^(.+),\s*([A-Za-z]{2})$/.exec(location.trim());
  if (!match) return null;
  const key = normalize(match[1]);
  const uf = match[2].toUpperCase();
  const found = all().find((m) => m.uf === uf && m.key === key);
  return found ? { nome: found.nome, uf: found.uf, estado: found.estado } : null;
}

/** Sugestões para o seletor. Aceita a UF no fim ("bom jesus pi" ou "bom jesus, pi"). */
export function searchMunicipios(query: string, limit = 8): Municipio[] {
  let text = normalize(query).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  let uf: string | null = null;
  const last = /\s([a-z]{2})$/.exec(text);
  if (last && UF_NOMES[last[1].toUpperCase()]) {
    uf = last[1].toUpperCase();
    text = text.slice(0, -3);
  }
  const scored: { m: Municipio & { key: string }; score: number }[] = [];
  for (const m of all()) {
    if (uf && m.uf !== uf) continue;
    const score = m.key === text ? 0 : m.key.startsWith(text) ? 1 : m.key.includes(` ${text}`) ? 2 : m.key.includes(text) ? 3 : -1;
    if (score >= 0) scored.push({ m, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.m.key.length - b.m.key.length || a.m.key.localeCompare(b.m.key))
    .slice(0, limit)
    .map(({ m }) => ({ nome: m.nome, uf: m.uf, estado: m.estado }));
}
