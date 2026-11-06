import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// O .env fica na raiz do monorepo, compartilhado com o worker.
loadEnvConfig(join(import.meta.dirname, '../..'));

const config: NextConfig = {
  transpilePackages: ['@lps/domain', '@lps/config', '@lps/db', '@lps/integrations'],
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  images: { unoptimized: true },
  headers: async () => [
    { source: '/p/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
  ],
};

export default config;
