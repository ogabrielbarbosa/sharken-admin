// pnpm producao — publica na nuvem (ambiente dev, que também é o staging) e liga o worker nele.
// Usa as chaves do .env.dev, na raiz do projeto.
import { existsSync } from 'node:fs';
import { countUsers, createUserInteractive, fail, FOR_SEARCH, ok, readEnv, REQUIRED, run, say, warn } from './lib.mjs';

const env = readEnv('.env.dev');
say('Chaves (.env.dev)');
if (!env) fail('Falta o arquivo .env.dev na raiz. Copie o .env.dev.example e preencha.');
const missing = [...REQUIRED, ...FOR_SEARCH].filter((k) => !env[k]);
if (missing.length) fail(`Preencha no .env.dev: ${missing.join(', ')}`);
if (/localhost|127\.0\.0\.1/.test(env.APP_URL)) fail('No .env.dev, APP_URL deve ser o endereço público do painel, não localhost.');
ok('completas');

say('Banco na nuvem');
if (!existsSync('supabase/.temp/project-ref')) {
  warn('Projeto ainda não vinculado. Informe o projeto do Supabase e a senha do banco.');
  if (!run('pnpm', ['exec', 'supabase', 'link'])) fail('Não foi possível vincular o projeto do Supabase.');
}
if (!run('pnpm', ['exec', 'supabase', 'db', 'push', '--linked'])) fail('Falha ao aplicar as migrações na nuvem.');
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
  if (!value || key === 'WEBHOOK_BASE_URL') continue;
  run('pnpm', ['exec', 'vercel', 'env', 'rm', key, 'production', '--yes'], { stdio: 'ignore' });
  if (!run('pnpm', ['exec', 'vercel', 'env', 'add', key, 'production'], { input: value, stdio: ['pipe', 'ignore', 'inherit'] })) fail(`Falha ao enviar ${key} para a Vercel.`);
}
ok('variáveis enviadas');
if (!vercel('deploy', '--prod')) fail('O deploy na Vercel falhou. Veja a mensagem acima.');
ok(`publicado em ${env.APP_URL}`);

say('Worker (no seu Mac, usando o banco da nuvem)');
console.log('  Ele processa as buscas, páginas e vídeos. Deixe esta janela aberta. Ctrl+C para parar.\n');
run('pnpm', ['--filter', '@lps/worker', 'start'], { env: { ...process.env, APP_ENV: 'dev' } });

