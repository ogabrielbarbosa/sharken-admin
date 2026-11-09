import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const say = (msg) => console.log(`\n▸ ${msg}`);
export const ok = (msg) => console.log(`  ✓ ${msg}`);
export const warn = (msg) => console.log(`  ! ${msg}`);
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
    readFileSync(file, 'utf8').split('\n').map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
  );
}

export const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'APP_URL', 'WEBHOOK_SECRET', 'CAPTURE_TOKEN', 'CRON_SECRET',
];
export const FOR_SEARCH = ['ANTHROPIC_API_KEY', 'APIFY_TOKEN'];

export async function countUsers(env) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase respondeu ${res.status}`);
  return ((await res.json()).users ?? []).length;
}

export async function createUserInteractive(env) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('  E-mail para entrar no painel: ')).trim();
  const password = (await rl.question('  Senha (mínimo 6 caracteres): ')).trim();
  rl.close();
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) fail(`Não foi possível criar o usuário: ${await res.text()}`);
  ok(`Usuário ${email} criado.`);
}
