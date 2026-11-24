import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// O .env fica na raiz do monorepo, compartilhado com o worker.
// Na Vercel ele não existe, e as variáveis vêm do painel (pnpm env:sync).
const envFile = join(import.meta.dirname, '../..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Impede que outro site embuta login e consentimento (clickjacking).
const noFraming = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const config: NextConfig = {
  transpilePackages: ['@lps/domain', '@lps/config', '@lps/db', '@lps/integrations'],
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  // Lista de cidades do mundo, lida em src/lib/world-cities.ts.
  outputFileTracingIncludes: { '/painel/**': ['./data/**'] },
  images: { unoptimized: true },
  // Arquivos e áudios do CRM sobem por server action (limite do WhatsApp: 16 MB).
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  headers: async () => [
    { source: '/p/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    { source: '/oauth/:path*', headers: noFraming },
    { source: '/login', headers: noFraming },
  ],
};

export default config;
