// pnpm db:migrate — aplica as migrações novas no Supabase da VPS (o único banco).
// O Postgres não fica exposto: abre um túnel SSH até o container, aplica e fecha. Nunca apaga dados.
import { spawn } from 'node:child_process';
import { fail, ok, quiet, readEnv, run, say } from './lib.mjs';

const env = readEnv('.env');
if (!env) fail('Falta o arquivo .env na raiz. Copie o .env.example e preencha.');
for (const k of ['SUPABASE_DB_SSH', 'SUPABASE_DB_CONTAINER', 'SUPABASE_DB_PASSWORD']) if (!env[k]) fail(`Preencha no .env: ${k}`);

say('Banco na VPS');
const ip = quiet('ssh', [env.SUPABASE_DB_SSH, `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' ${env.SUPABASE_DB_CONTAINER}`])?.trim().split(' ')[0];
if (!ip) fail(`Não achei o container ${env.SUPABASE_DB_CONTAINER} em ${env.SUPABASE_DB_SSH}. Ele está rodando no Coolify?`);
const tunnel = spawn('ssh', ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `55432:${ip}:5432`, env.SUPABASE_DB_SSH], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
const dbUrl = `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@127.0.0.1:55432/postgres?sslmode=disable`;
const pushed = run('pnpm', ['exec', 'supabase', 'db', 'push', '--remote', dbUrl, '--yes']);
tunnel.kill();
if (!pushed) fail('Falha ao aplicar as migrações.');
ok('migrações aplicadas (só as que faltavam)');
