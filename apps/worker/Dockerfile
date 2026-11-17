# Worker em produção (VPS, pelo Coolify). Build a partir da raiz do repositório:
#   docker build -f apps/worker/Dockerfile .
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/integrations/package.json packages/integrations/

# Só o worker, os pacotes dele e o tsx da raiz.
RUN pnpm install --frozen-lockfile --filter "@lps/worker..." --filter sharken-admin \
 && pnpm --filter @lps/worker exec playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/domain packages/domain
COPY packages/integrations packages/integrations
COPY apps/worker apps/worker

WORKDIR /app/apps/worker
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
