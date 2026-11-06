// Cria ou atualiza o .env.local com os dados do Supabase local e segredos novos.
// Nunca apaga as chaves que você já preencheu.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = '.env.local';
const parse = (text) => Object.fromEntries(
  text.split('\n').map((l) => l.match(/^([A-Z_]+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);

let status;
try {
  status = parse(execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.error('O Supabase local não está rodando. Rode `pnpm db:start` primeiro.');
  process.exit(1);
}

const source = existsSync(FILE) ? FILE : '.env.local.example';
const secret = () => randomBytes(32).toString('hex');
const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
};
const output = readFileSync(source, 'utf8').split('\n').map((line) => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (!match) return line;
  const [, key, current] = match;
  if (values[key]) return `${key}=${values[key]}`;
  if (['WEBHOOK_SECRET', 'CAPTURE_TOKEN', 'CRON_SECRET'].includes(key) && !current) return `${key}=${secret()}`;
  return line;
});
writeFileSync(FILE, output.join('\n'));
console.log(`${FILE} pronto. Preencha ANTHROPIC_API_KEY e APIFY_TOKEN para buscar leads.`);
