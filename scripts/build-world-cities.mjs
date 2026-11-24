// Gera apps/web/data/world-cities.tsv.gz e packages/domain/src/countries-data.ts a partir do GeoNames (CC BY 4.0).
// Uso: node scripts/build-world-cities.mjs <pasta com cities500.txt, admin1CodesASCII.txt e countryInfo.txt>
// (https://download.geonames.org/export/dump/). O Brasil fica de fora: usa a lista do IBGE.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2];
const root = join(import.meta.dirname, '..');
const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
const clean = (s) => s.replace(/[|,;\t+]/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pt = new Intl.DisplayNames('pt-BR', { type: 'region' });

const regions = new Map(lines('admin1CodesASCII.txt').map((r) => [r[0], clean(r[1])]));
const rows = new Map();
for (const r of lines('cities500.txt')) {
  const [, rawName, , alternates, lat, lng, , feature, country, , admin1] = r;
  // PPLX é bairro; os de histórico/abandonados não são cidade de hoje.
  if (country === 'BR' || ['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH'].includes(feature)) continue;
  const pop = Number(r[14]) || 0;
  const name = clean(rawName);
  const region = regions.get(`${country}.${admin1}`) ?? '';
  const aliases = pop < 50_000 ? [] : [...new Set(alternates.split(',').map(norm).filter((a) => a && a !== norm(name) && a.length <= 30 && /^[a-z0-9 .'-]+$/.test(a)))];
  const label = [name, region, pt.of(country)].filter(Boolean).join(', ');
  if ((rows.get(label)?.pop ?? -1) >= pop) continue; // mesmo nome na mesma região: fica a mais populosa
  rows.set(label, { pop, line: [label, aliases.join(';'), admin1, country, Number(lat).toFixed(4), Number(lng).toFixed(4), pop].join('|') });
}
const tsv = [...rows.values()].sort((a, b) => b.pop - a.pop).map((r) => r.line).join('\n');
const gz = gzipSync(tsv, { level: 9 });
writeFileSync(join(root, 'apps/web/data/world-cities.tsv.gz'), gz);

// Idioma principal de cada país, no código que os atores do Apify aceitam.
const OVERRIDE = { SG: 'en', ZA: 'en', PH: 'en', PR: 'es', LU: 'fr', HK: 'zh-TW', TW: 'zh-TW', MO: 'zh-TW', BR: 'pt-BR' };
const ALIAS = { pt: 'pt-PT', zh: 'zh-CN', cmn: 'zh-CN', he: 'iw', nb: 'no', nn: 'no' };
// Só o que os dois atores (busca no Google e Google Maps) aceitam; o resto cai no inglês.
const OK = new Set('en af az id ms bs ca cs da de et es eu fr gl hr is it sw lv lt nl no pl pt-BR pt-PT hu ro sq sk sl fi sv vi tr el bg mk sr uk ka iw ur ar fa ne hi mr bn ta te ml si th ko ja zh-CN zh-TW ru'.split(' '));
const langs = {};
for (const c of lines('countryInfo.txt')) {
  const first = (c[15] ?? '').split(',')[0].split('-')[0];
  const lang = OVERRIDE[c[0]] ?? ALIAS[first] ?? first;
  langs[c[0]] = OK.has(lang) ? lang : 'en';
}
writeFileSync(join(root, 'packages/domain/src/countries-data.ts'), `// Gerado por scripts/build-world-cities.mjs (GeoNames, CC BY 4.0). Não editar à mão.
/** Idioma principal de cada país, no código aceito pelos atores do Apify. */
export const COUNTRY_LANGUAGE: Record<string, string> = ${JSON.stringify(langs)};
`);
console.log(`${rows.size} cidades, ${(gz.length / 1e6).toFixed(1)} MB; US=${langs.US} PT=${langs.PT} DE=${langs.DE} JP=${langs.JP}`);
