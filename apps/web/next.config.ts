import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// O .env fica na raiz do monorepo, compartilhado com o worker.
// Na Vercel ele não existe, e as variáveis vêm do painel (pnpm env:sync).
const envFile = join(import.meta.dirname, '../..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config: NextConfig = {
  transpilePackages: ['@lps/domain', '@lps/config', '@lps/db', '@lps/integrations'],
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  images: { unoptimized: true },
  // Arquivos e áudios do CRM sobem por server action (limite do WhatsApp: 16 MB).
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  headers: async () => [
    { source: '/p/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
  ],
};

export default config;
