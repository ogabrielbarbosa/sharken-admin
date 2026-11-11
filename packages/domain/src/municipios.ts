import { MUNICIPIOS_RAW, UF_NOMES } from './municipios-data';

export type Municipio = { nome: string; uf: string; estado: string };

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let cache: (Municipio & { key: string })[] | null = null;
function all() {
  cache ??= MUNICIPIOS_RAW.split('\n').map((line) => {
    const [nome, uf] = line.split('|');
    return { nome, uf, estado: UF_NOMES[uf], key: normalize(nome) };
  });
  return cache;
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
