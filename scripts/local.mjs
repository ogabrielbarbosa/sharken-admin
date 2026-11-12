// pnpm local — prepara e sobe tudo na sua máquina: banco, chaves, usuário, painel e worker.
// Pode rodar sempre: ele só faz o que falta e nunca apaga dados.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { prepareWhatsAppTunnel } from './whatsapp-tunnel.mjs';
import { countUsers, createUserInteractive, fail, FOR_SEARCH, ok, quiet, readEnv, run, say, warn } from './lib.mjs';

const checkOnly = process.argv.includes('--check');
const sb = (...args) => ['exec', 'supabase', ...args];

say('Node');
if (Number(process.versions.node.split('.')[0]) < 22) fail(`Precisa do Node 22 ou mais novo. Você está no ${process.version}.`);
ok(process.version);

say('Dependências');
if (!run('pnpm', ['install', '--prefer-offline'], { stdio: ['ignore', 'ignore', 'inherit'] })) fail('pnpm install falhou.');
ok('instaladas');
if (!run('pnpm', ['--filter', '@lps/worker', 'exec', 'playwright', 'install', 'chromium'], { stdio: ['ignore', 'ignore', 'inherit'] })) fail('Não foi possível instalar o navegador do worker.');
ok('navegador do worker pronto');

say('Docker');
if (quiet('docker', ['info']) === null) {
  warn('Docker fechado. Abrindo o Docker Desktop…');
  quiet('open', ['-a', 'Docker']);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    ready = quiet('docker', ['info']) !== null;
  }
  if (!ready) fail('O Docker não abriu. Abra o Docker Desktop e rode pnpm local de novo.');
}
ok('rodando');

say('Banco local (Supabase)');
if (quiet('pnpm', sb('status')) === null) {
  if (!run('pnpm', sb('start'))) fail('O Supabase local não subiu. Veja a mensagem acima.');
}
ok('no ar, com os dados preservados');
if (!run('pnpm', sb('migration', 'up'), { stdio: ['ignore', 'ignore', 'inherit'] })) fail('Falha ao aplicar migrações novas.');
ok('migrações em dia');

say('Chaves (.env.local)');
if (!run('node', ['scripts/setup-local.mjs'], { stdio: ['ignore', 'ignore', 'inherit'] })) fail('Não foi possível preparar o .env.local.');
const env = readEnv('.env.local');
ok('.env.local pronto na raiz do projeto');
const missing = FOR_SEARCH.filter((k) => !env[k]);
if (missing.length) warn(`Para buscar leads, preencha no .env.local: ${missing.join(', ')}. O painel funciona sem elas.`);

say('Usuário do painel');
if ((await countUsers(env)) === 0) {
  if (checkOnly || !process.stdin.isTTY) warn('Nenhum usuário. Rode pnpm user:create <email> <senha>.');
  else await createUserInteractive(env);
} else ok('já existe');

if (checkOnly) {
  console.log('\nTudo pronto. Rode pnpm local para subir o painel e o worker.\n');
  process.exit(0);
}

const busy = await new Promise((resolve) => {
  const socket = createConnection(3010, '127.0.0.1');
  socket.on('connect', () => { socket.end(); resolve(true); });
  socket.on('error', () => resolve(false));
});
if (busy) fail('A porta 3010 já está em uso. Feche o outro servidor do painel e rode de novo.');
const others = (quiet('pgrep', ['-f', `${process.cwd()}/apps/web.*next (dev|start)`]) ?? '').trim().split('\n').filter(Boolean);
if (others.length) fail(`Já existe um servidor do painel rodando (PID ${others.join(', ')}). Feche com Ctrl+C no terminal dele ou rode: kill ${others.join(' ')}`);

say('WhatsApp');
const whatsappEnv = await prepareWhatsAppTunnel(env, 3010);
if (!env.EVOLUTION_URL) ok('Evolution não configurada (opcional)');

console.log(`
┌─────────────────────────────────────────────────────────┐
│  Painel            http://localhost:3010                │
│  Banco (Studio)    http://127.0.0.1:57323               │
│  Para parar        Ctrl+C (o banco continua com dados)  │
└─────────────────────────────────────────────────────────┘
`);
// Assíncrono (não spawnSync): o vigia do túnel do WhatsApp precisa rodar enquanto o painel está no ar.
const dev = spawn('pnpm', ['exec', 'turbo', 'run', 'dev', '--filter=@lps/web', '--filter=@lps/worker'], { stdio: 'inherit', env: { ...process.env, ...whatsappEnv, APP_ENV: 'local' } });
// Ctrl+C chega ao turbo pelo terminal; aqui só esperamos ele sair. Um kill direto neste processo é repassado.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => dev.kill('SIGTERM'));
dev.on('exit', (code) => process.exit(code ?? 0));
