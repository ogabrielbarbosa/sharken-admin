import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const say = (msg) => console.log(`\n▸ ${msg}`);
export const ok = (msg) => console.log(`  ✓ ${msg}`);
export function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Roda um comando mostrando a saída. Devolve true se deu certo. */
export function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts }).status === 0;
}

/** Roda um comando em silêncio. Devolve a saída, ou null se falhou. */
export function quiet(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts });
  } catch {
    return null;
  }
}

export function readEnv(file) {
  if (!existsSync(file)) return null;
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n').map((l) => l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim().replace(/^(['"])(.*)\1$/, '$2')]),
  );
}
