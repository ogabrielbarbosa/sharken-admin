// pnpm producao — publica na nuvem (ambiente dev, que também é o staging).
// O worker roda na VPS, pelo Coolify (apps/worker/Dockerfile); ver docs/ambientes.md.
// Usa as chaves do .env.dev, na raiz do projeto.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { countUsers, createUserInteractive, fail, quiet, FOR_SEARCH, ok, readEnv, REQUIRED, run, say, warn } from './lib.mjs';

const env = readEnv('.env.dev');
const DB_KEYS = ['SUPABASE_DB_SSH', 'SUPABASE_DB_CONTAINER', 'SUPABASE_DB_PASSWORD'];
say('Chaves (.env.dev)');
if (!env) fail('Falta o arquivo .env.dev na raiz. Copie o .env.dev.example e preencha.');
const missing = [...REQUIRED, ...FOR_SEARCH].filter((k) => !env[k]);
if (missing.length) fail(`Preencha no .env.dev: ${missing.join(', ')}`);
if (/localhost|127\.0\.0\.1/.test(env.APP_URL)) fail('No .env.dev, APP_URL deve ser o endereço público do painel, não localhost.');
ok('completas');

say('Banco na VPS');
// O Postgres não fica exposto: abre um túnel SSH até o container, aplica as migrações e fecha.
for (const k of DB_KEYS) if (!env[k]) fail(`Preencha no .env.dev: ${k}`);
const ip = quiet('ssh', [env.SUPABASE_DB_SSH, `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' ${env.SUPABASE_DB_CONTAINER}`])?.trim().split(' ')[0];
if (!ip) fail(`Não achei o container ${env.SUPABASE_DB_CONTAINER} em ${env.SUPABASE_DB_SSH}. Ele está rodando no Coolify?`);
const tunnel = spawn('ssh', ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `55432:${ip}:5432`, env.SUPABASE_DB_SSH], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const dbUrl = `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@127.0.0.1:55432/postgres?sslmode=disable`;
const pushed = run('pnpm', ['exec', 'supabase', 'db', 'push', '--remote', dbUrl, '--yes']);
tunnel.kill();
if (!pushed) fail('Falha ao aplicar as migrações no banco da VPS.');
ok('migrações aplicadas (só as que faltavam)');

say('Usuário do painel');
if ((await countUsers(env)) === 0) await createUserInteractive(env);
else ok('já existe');

say('Vercel');
const vercel = (...args) => run('pnpm', ['exec', 'vercel', ...args]);
if (!existsSync('.vercel/project.json')) {
  warn('Projeto ainda não vinculado. Na primeira vez, escolha "Root Directory: apps/web".');
  if (!vercel('link')) fail('Não foi possível vincular o projeto da Vercel.');
}
for (const [key, value] of Object.entries(env)) {
  if (!value || key === 'WEBHOOK_BASE_URL' || DB_KEYS.includes(key)) continue;
  // NEXT_PUBLIC_ vai para o navegador de qualquer jeito; sem --type a CLI só pergunta e não grava.
  const type = key.startsWith('NEXT_PUBLIC_') ? 'config' : 'secret';
  const args = ['exec', 'vercel', 'env', 'add', key, '--environment', 'production', '--type', type, '--force', '--yes'];
  if (!run('pnpm', args, { input: value, stdio: ['pipe', 'ignore', 'inherit'] })) fail(`Falha ao enviar ${key} para a Vercel.`);
}
const listed = quiet('pnpm', ['exec', 'vercel', 'env', 'ls', 'production']) ?? '';
const notSent = Object.entries(env).filter(([k, v]) => v && k !== 'WEBHOOK_BASE_URL' && !DB_KEYS.includes(k) && !listed.includes(k)).map(([k]) => k);
if (notSent.length) fail(`A Vercel não gravou: ${notSent.join(', ')}`);
ok('variáveis enviadas');
if (!vercel('deploy', '--prod')) fail('O deploy na Vercel falhou. Veja a mensagem acima.');
ok(`publicado em ${env.APP_URL}`);

say('Worker');
ok('roda na VPS (Coolify) e se atualiza a cada push na main; as variáveis dele ficam no painel do Coolify');
