// pnpm env:sync — envia o .env para a Vercel (painel) e para o Coolify (worker), e reinicia o worker.
// APP_URL vira PUBLIC_URL lá fora. As chaves "só local" ficam no seu Mac.
import { fail, ok, quiet, readEnv, run, say } from './lib.mjs';

const LOCAL_ONLY = ['PUBLIC_URL', 'SUPABASE_DB_SSH', 'SUPABASE_DB_CONTAINER', 'SUPABASE_DB_PASSWORD', 'COOLIFY_URL', 'COOLIFY_API_TOKEN', 'COOLIFY_WORKER_UUID'];
const env = readEnv('.env');
if (!env) fail('Falta o arquivo .env na raiz.');
if (!env.PUBLIC_URL) fail('Preencha PUBLIC_URL no .env (endereço do painel publicado).');
const remote = Object.fromEntries(
  Object.entries({ ...env, APP_URL: env.PUBLIC_URL }).filter(([k, v]) => v && !LOCAL_ONLY.includes(k)),
);

say('Vercel (painel)');
for (const [key, value] of Object.entries(remote)) {
  // NEXT_PUBLIC_ vai para o navegador de qualquer jeito; sem --type a CLI só pergunta e não grava.
  const type = key.startsWith('NEXT_PUBLIC_') ? 'config' : 'secret';
  const args = ['exec', 'vercel', 'env', 'add', key, '--environment', 'production', '--type', type, '--force', '--yes'];
  if (!run('pnpm', args, { input: value, stdio: ['pipe', 'ignore', 'inherit'] })) fail(`Falha ao enviar ${key} para a Vercel.`);
}
const listed = quiet('pnpm', ['exec', 'vercel', 'env', 'ls', 'production']) ?? '';
const notSent = Object.keys(remote).filter((k) => !listed.includes(k));
if (notSent.length) fail(`A Vercel não gravou: ${notSent.join(', ')}`);
ok(`${Object.keys(remote).length} variáveis. Valem no próximo deploy (git push na main).`);

say('Coolify (worker)');
if (!env.COOLIFY_URL || !env.COOLIFY_API_TOKEN || !env.COOLIFY_WORKER_UUID) fail('Preencha COOLIFY_URL, COOLIFY_API_TOKEN e COOLIFY_WORKER_UUID no .env.');
const api = (path, init = {}) => fetch(`${env.COOLIFY_URL}/api/v1/applications/${env.COOLIFY_WORKER_UUID}${path}`, {
  ...init, headers: { Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`, 'Content-Type': 'application/json' },
});
const res = await api('/envs/bulk', { method: 'PATCH', body: JSON.stringify({ data: Object.entries(remote).map(([key, value]) => ({ key, value, is_preview: false })) }) });
if (!res.ok) fail(`O Coolify recusou as variáveis (${res.status}).`);
const restart = await api('/restart', { method: 'POST' });
if (!restart.ok) fail(`Variáveis gravadas, mas o worker não reiniciou (${restart.status}). Reinicie pelo Coolify.`);
ok('variáveis gravadas e worker reiniciando');
