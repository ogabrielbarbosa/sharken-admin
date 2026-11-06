import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// O arquivo de ambiente fica na raiz do monorepo, compartilhado com o worker.
// Na Vercel ele não existe, e as variáveis vêm do painel.
const envFile = join(import.meta.dirname, '../..', `.env.${process.env.APP_ENV ?? 'local'}`);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  transpilePackages: ['@lps/domain', '@lps/config', '@lps/db', '@lps/integrations'],
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  images: { unoptimized: true },
  headers: async () => [
    { source: '/p/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
  ],
};

export default config;
