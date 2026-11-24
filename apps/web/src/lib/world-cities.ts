import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseWorldCities, type WorldIndex } from '@lps/domain';

let cache: Promise<WorldIndex> | null = null;

/** Cidades do mundo (GeoNames), lidas uma vez por processo. O arquivo entra no deploy pelo `outputFileTracingIncludes`. */
export function worldCities(): Promise<WorldIndex> {
  cache ??= readFile(join(process.cwd(), 'data/world-cities.tsv.gz'))
    .then((gz) => parseWorldCities(gunzipSync(gz).toString('utf8')))
    .catch((err) => { cache = null; throw err; });
  return cache;
}
