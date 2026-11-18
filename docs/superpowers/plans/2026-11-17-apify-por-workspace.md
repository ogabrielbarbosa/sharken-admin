# Apify por workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada workspace usa o próprio token do Apify, guardado em Configurações › Apify; o `APIFY_TOKEN` some do projeto.

**Architecture:** Tabela `workspace_apify` (só `service_role`), funções em `packages/db`, e o token passa a ser parâmetro de toda chamada ao Apify em `packages/integrations/src/apify.ts`. Captura (web + worker) e jobs do worker buscam o token pelo workspace do batch/job. Aba nova em Configurações para conectar.

**Tech Stack:** TypeScript, Next.js (server actions), Supabase/Postgres, Vitest + PGlite, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-11-17-apify-por-workspace-design.md`

## Global Constraints

- Sem fallback para token global: nenhum código lê `process.env.APIFY_TOKEN` ao final.
- Mensagem sem token (exata): `Conecte sua conta do Apify em Configurações › Apify.`
- Mensagem de crédito esgotado (exata): `Acabou o crédito do Apify deste mês. Veja em console.apify.com › Billing.`
- O token nunca volta inteiro para o navegador: na tela, só `…` + últimos 4 caracteres.
- Só dono do workspace (ou admin da plataforma) salva/remove o token (`requireOwner`, como a AbacatePay).
- Migrações compatíveis com o código publicado; nunca comandos que apagam dados.
- Textos de interface em português, no tom das abas existentes.

## Review Focus

- Webhook do Apify chegando para batch cujo workspace removeu o token depois de iniciar a busca → batch vai para `erro` com a mensagem sem token, sem exceção 500 (teste na Task 3).
- `syncSearchProgress`/`pollPendingRuns` com vários batches, um deles sem token → os outros seguem; o sem token não derruba o laço (teste na Task 3).
- Token colado com espaços/quebra de linha → `trim()` antes de validar e salvar (teste na Task 5, via `parseApifyToken`).
- Token inválido (Apify responde 401) ao salvar → nada é salvo, erro "O Apify recusou esse token." (teste na Task 2 para `apifyAccount`).
- Job de imagens do Qualificado sem token → falha definitiva (`JobFailure`) com a mensagem sem token, sem 3 tentativas (teste na Task 4).

---

### Task 1: Tabela e acesso ao token

**Files:**
- Create: `supabase/migrations/0022_workspace_apify.sql`
- Create: `packages/db/src/apify.ts`
- Modify: `packages/db/src/index.ts` (exportar `./apify`)
- Modify: `packages/db/tests/migrations.test.ts:39-43` (lista de tabelas ganha `'workspace_apify'`, logo antes de `'workspace_billing'`)
- Test: `packages/db/tests/apify.test.ts`

**Interfaces:**
- Produces:
  - `type WorkspaceApify = { workspace_id: string; updated_at: string; token: string; username: string | null; plan: string | null }`
  - `getWorkspaceApify(db: Db, workspaceId: string): Promise<WorkspaceApify | null>`
  - `getApifyToken(db: Db, workspaceId: string): Promise<string | null>`
  - `saveWorkspaceApify(db: Db, row: Omit<WorkspaceApify, 'updated_at'>): Promise<void>` (upsert por `workspace_id`)
  - `deleteWorkspaceApify(db: Db, workspaceId: string): Promise<void>`
  - Todas recebem o cliente sem escopo (service role), como `billing.ts`.

- [ ] **Step 1: Escrever a migração** — `workspace_apify (workspace_id uuid primary key references workspaces(id) on delete cascade, updated_at timestamptz not null default now(), token text not null, username text, plan text)`; `enable row level security`; `grant all on workspace_apify to service_role`; sem políticas (comentário no topo explicando, no estilo da 0018).
- [ ] **Step 2: Atualizar a lista em `migrations.test.ts`** e escrever `packages/db/tests/apify.test.ts` (PGlite, mesmo setup de `billing.test.ts`):
  - `getApifyToken` devolve `null` sem linha;
  - depois de `saveWorkspaceApify(raw, { workspace_id: wsA, token: 'apify_api_x', username: 'gabriel', plan: 'FREE' })`, `getApifyToken(raw, wsA)` é `'apify_api_x'` e `getApifyToken(raw, wsB)` é `null`;
  - salvar de novo troca o token (upsert);
  - `deleteWorkspaceApify` volta a `null`.
- [ ] **Step 3: Rodar e ver falhar** — `pnpm --filter @lps/db test -- apify migrations` → FAIL (módulo inexistente / tabela ausente).
- [ ] **Step 4: Implementar `packages/db/src/apify.ts`** e exportar no `index.ts`.
- [ ] **Step 5: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 6: Commit** — `feat(db): tabela workspace_apify com o token do Apify por workspace`

### Task 2: Token como parâmetro no cliente do Apify

**Files:**
- Modify: `packages/integrations/src/apify.ts`
- Test: `packages/integrations/tests/apify.test.ts`

**Interfaces:**
- Produces (todas com `token` como primeiro parâmetro; `function token()` e a leitura de env são removidas):
  - `startActorRun(token: string, actor: string, input: object, webhookUrl: string | null): Promise<string>`
  - `fetchDataset<T = ApifyPlace>(token: string, datasetId: string): Promise<T[]>`
  - `getRun(token: string, runId: string): Promise<{ status: string; defaultDatasetId: string | null }>`
  - `runActorSync<T>(token: string, actor: string, input: object, timeoutMs?: number): Promise<T[]>`
  - `apifyAccount(token: string, fetcher?: typeof fetch): Promise<{ username: string; plan: string }>` — `GET https://api.apify.com/v2/users/me` com `authorization: Bearer`; `plan` = `data.plan.id` (ex.: `FREE`, `STARTER`).
  - `export const APIFY_NOT_CONNECTED = 'Conecte sua conta do Apify em Configurações › Apify.'`
  - `export const APIFY_OUT_OF_CREDIT = 'Acabou o crédito do Apify deste mês. Veja em console.apify.com › Billing.'`
  - `export class ApifyNotConnected extends Error` (mensagem = `APIFY_NOT_CONNECTED`)
  - `apifyErrorMessage(status: number, body: { error?: { type?: string; message?: string } } | null, fallback: string): string` — devolve `APIFY_OUT_OF_CREDIT` quando `status === 402` ou `body.error.type` casa com `/usage|credit|payment|limit-exceeded/i` ou a mensagem casa com `/monthly usage|not enough|credit/i`; senão `` `${fallback} (${status})${detail ? `: ${detail}` : '.'}` `` (o formato atual).
  - Todas as funções de rede passam a usar `apifyErrorMessage` nos `!res.ok`, mantendo os prefixos atuais ("O Apify recusou a busca", "Não foi possível ler os resultados do Apify", etc.). `apifyAccount` com 401 lança `'O Apify recusou esse token.'`.

- [ ] **Step 1: Testes que falham** em `apify.test.ts`:
  - `apifyErrorMessage(402, null, 'O Apify recusou a busca')` → `APIFY_OUT_OF_CREDIT`;
  - `apifyErrorMessage(403, { error: { type: 'not-enough-usage-to-run-paid-actor', message: 'x' } }, 'O Apify recusou a busca')` → `APIFY_OUT_OF_CREDIT`;
  - `apifyErrorMessage(400, { error: { type: 'invalid-input', message: 'campo errado' } }, 'O Apify recusou a busca')` → `'O Apify recusou a busca (400): campo errado'`;
  - `apifyAccount('tok', fakeFetch)` com resposta `{ data: { username: 'ana', plan: { id: 'FREE' } } }` → `{ username: 'ana', plan: 'FREE' }` e o header `authorization` é `'Bearer tok'`;
  - `apifyAccount` com 401 rejeita com `'O Apify recusou esse token.'`.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @lps/integrations test -- apify` → FAIL.
- [ ] **Step 3: Implementar** as assinaturas acima (`buildRunUrl` já recebe token e fica igual).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS. `pnpm --filter @lps/integrations typecheck` vai acusar os chamadores em `capture.ts`; eles são da Task 3 (pode deixar o build quebrado só entre a Task 2 e a 3 se executar em sequência, ou fazer as duas no mesmo commit).
- [ ] **Step 5: Commit** — `feat(integrations): token do Apify como parâmetro e erro de crédito esgotado`

### Task 3: Captura com o token do workspace

**Files:**
- Modify: `packages/integrations/src/capture.ts`
- Modify: `apps/web/src/app/painel/batches/actions.ts`
- Modify: `apps/web/src/app/api/webhooks/apify/route.ts` (só se precisar; o handler já resolve o workspace pelo batch)
- Test: `packages/integrations/tests/capture.test.ts` (novo; mockar `@lps/db` e `fetch` com `vi.mock`/`vi.stubGlobal`)

**Interfaces:**
- Consumes: `getApifyToken` (Task 1); funções e constantes da Task 2.
- Produces:
  - `workspaceHasApify(workspaceId: string): Promise<boolean>` (exportada de `capture.ts`, usa `createAdminClient()`)
  - Comportamento: `startMapsSearch`, `handleMapsResult`, `handleInstagramResult`, `syncSearchProgress`, `pollPendingRuns` buscam o token por `batch.workspace_id` (ou pelo workspace do batch em `batchDb`) uma vez por batch.
    - Sem token em `startMapsSearch`/`handleMapsResult`: `updateBatch(..., { status: 'erro', error: APIFY_NOT_CONNECTED })`, sem chamar o Apify.
    - Sem token em `handleInstagramResult`: segue para `enqueueAnalysis` (Instagram é opcional, como hoje).
    - Sem token em `syncSearchProgress`/`pollPendingRuns`: pula o batch (`continue`); em `pollPendingRuns` envolver cada batch em try/catch para um batch não derrubar os outros.
- `createBatchAction`: antes de `createBatch`, se `!(await workspaceHasApify(workspace.id))` → `throw new Error(APIFY_NOT_CONNECTED)` (pegar o workspace da sessão com `getSession()` de `@/lib/auth`, como nas outras actions). `retryBatchAction` só chama `startMapsSearch`, que já trata a falta de token.

- [ ] **Step 1: Testes que falham** em `capture.test.ts`:
  - `startMapsSearch(batch)` com `getApifyToken` → `null`: `updateBatch` chamado com `{ status: 'erro', error: APIFY_NOT_CONNECTED }` e `fetch` não chamado;
  - com token `'t1'`: a URL do `fetch` contém `token=t1`;
  - `handleMapsResult` para batch sem token (removido depois de iniciar): `updateBatch` com erro sem token, sem exceção;
  - `syncSearchProgress` com dois batches `buscando` (A sem token, B com token `'tb'`): `fetch` chamado só com `token=tb`.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @lps/integrations test -- capture` → FAIL.
- [ ] **Step 3: Implementar** em `capture.ts` e em `batches/actions.ts`.
- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @lps/integrations test && pnpm --filter @lps/integrations typecheck` → PASS.
- [ ] **Step 5: Mostrar o erro no formulário de novo batch** — conferir em `apps/web/src/components/batches/new-batch-drawer.tsx` como o erro de "Escolha a cidade" aparece hoje e garantir que `APIFY_NOT_CONNECTED` aparece do mesmo jeito, com link para `/painel/configuracoes?aba=apify`. Verificar com `pnpm --filter web typecheck`.
- [ ] **Step 6: Commit** — `feat: captura usa o token do Apify do workspace`

### Task 4: Jobs do worker com o token do workspace

**Files:**
- Modify: `apps/worker/src/jobs/instagram-media.ts`
- Modify: `apps/worker/src/jobs/extract-asset.ts`
- Test: `apps/worker/tests/instagram-media.test.ts` (novo), `apps/worker/tests/extract-asset.test.ts`

**Interfaces:**
- Consumes: `getApifyToken` (Task 1), `runActorSync(token, …)`, `APIFY_NOT_CONNECTED`, `APIFY_OUT_OF_CREDIT` (Task 2).
- Produces: helper local `apifyTokenFor(job: Job): Promise<string>` em `apps/worker/src/jobs/apify-token.ts` — `job.workspace_id` nulo ou sem token → `throw new JobFailure(APIFY_NOT_CONNECTED)`; erro com `APIFY_OUT_OF_CREDIT` vindo do Apify também vira `JobFailure` (não adianta tentar de novo no mesmo mês).
- `instagramMediaJob`: pega o token logo antes de `runActorSync` (depois das checagens de lead e R2).
- `extractInstagram(url, token)`: o token só é buscado quando o link é do Instagram.
- `friendlyError` em `extract-asset.ts`: devolver a mensagem como está quando for `APIFY_NOT_CONNECTED` ou `APIFY_OUT_OF_CREDIT` (antes do teste `/Apify/i`, que hoje engoliria as duas).

- [ ] **Step 1: Testes que falham**:
  - `instagram-media.test.ts`: com `vi.mock('@lps/db')` (`getLead` devolve lead com `instagram_url`, `getApifyToken` → `null`) e R2 configurado no env de teste, `instagramMediaJob(db, job)` rejeita com `JobFailure` de mensagem `APIFY_NOT_CONNECTED`;
  - `extract-asset.test.ts`: exportar `friendlyError` e testar que `friendlyError(APIFY_NOT_CONNECTED)` e `friendlyError(APIFY_OUT_OF_CREDIT)` voltam iguais, e `friendlyError('O Apify recusou a leitura (500).')` continua `'Não consegui ler o perfil do Instagram.'`.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter worker test` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter worker test && pnpm --filter worker typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(worker): imagens e extração do Instagram usam o token do workspace`

### Task 5: Configurações › Apify

**Files:**
- Modify: `apps/web/src/app/painel/configuracoes/page.tsx` (tipo `Tab` ganha `'apify'`; item no menu depois de Pagamentos, ícone `Search` ou `Radar` do lucide; componente `ApifyTab`)
- Modify: `apps/web/src/app/painel/configuracoes/actions.ts` (tipo `Tab` igual; `saveApifyAction`, `removeApifyAction`)
- Modify: `packages/domain/src/` — adicionar `parseApifyToken(raw: string): string | null` e `maskApifyToken(token: string): string` num arquivo `apify.ts` exportado no index do domain
- Test: `packages/domain/tests/apify.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceApify`, `saveWorkspaceApify`, `deleteWorkspaceApify` (Task 1); `apifyAccount` (Task 2).
- Produces:
  - `parseApifyToken(raw)`: `trim()`, remove espaços internos/quebras; vazio → `null`; senão o token.
  - `maskApifyToken(token)`: `'…' + últimos 4`; token com menos de 8 caracteres → `'••••'`.
  - `saveApifyAction(formData)`: `requireOwner('apify')`; `parseApifyToken(text(formData, 'token'))` nulo → erro "Cole o token do Apify."; `apifyAccount(token)` (erro → `back('apify', { erro: message })`, nada salvo); salva `{ token, username, plan }`; ok: `` `Apify conectado como ${username} (plano ${plan}).` ``.
  - `removeApifyAction()`: `requireOwner('apify')`, apaga; ok: "Apify desconectado. Batches novos ficam bloqueados até conectar de novo."
- `ApifyTab` (mesmo layout da `BillingTab`): conectado → "Conectado como <username>", `maskApifyToken`, badge com o plano, botão Desconectar (só `canEdit`); desconectado → "Ainda não conectado. Sem ele, não dá para criar batch nem baixar as imagens do Instagram." Formulário (só `canEdit`): campo `token` tipo password; instruções: "No Apify: Settings › API & Integrations › Personal API token" com link `https://console.apify.com/settings/integrations`; nota: "A conta gratuita traz US$ 5 de crédito por mês, uns 7 batches de 50 lugares."

- [ ] **Step 1: Testes que falham** em `packages/domain/tests/apify.test.ts`: `parseApifyToken('  apify_api_abc \n')` → `'apify_api_abc'`; `parseApifyToken('   ')` → `null`; `maskApifyToken('apify_api_abcd1234')` → `'…1234'`; `maskApifyToken('abc')` → `'••••'`.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @lps/domain test -- apify` → FAIL.
- [ ] **Step 3: Implementar** domain, actions e a aba.
- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter @lps/domain test && pnpm --filter web typecheck && pnpm --filter web test` → PASS.
- [ ] **Step 5: Ver a tela** — `pnpm dev`, abrir `/painel/configuracoes?aba=apify`, conferir os dois estados (sem conectar e, se o Gabriel autorizar, conectado). Lembrar: o banco é o de produção.
- [ ] **Step 6: Commit** — `feat(web): aba Apify em Configurações para conectar a conta do workspace`

### Task 6: Tirar o APIFY_TOKEN do projeto e atualizar docs

**Files:**
- Modify: `packages/config/src/env.ts:7` (remover `APIFY_TOKEN`)
- Modify: `packages/config/tests/env.test.ts:8,29` (remover)
- Modify: `.env.example` (remover a linha)
- Modify: `docs/ambientes.md` (Apify: token por workspace em Configurações › Apify; tirar do inventário de variáveis)
- Modify: `CLAUDE.md` (Decisões › Workspaces: "ZapSign e Claude ainda usam as chaves do `.env`"; o Apify usa o token de cada workspace, em Configurações › Apify)

- [ ] **Step 1: Remover e conferir** — `grep -rn APIFY_TOKEN apps packages scripts .env.example docs CLAUDE.md --include='*' | grep -v node_modules | grep -v .next` → nenhuma ocorrência (fora do histórico de specs/planos antigos).
- [ ] **Step 2: Rodar tudo** — `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 3: Commit** — `chore: APIFY_TOKEN sai do projeto; Apify por workspace`

### Task 7: Publicar (com o Gabriel)

- [ ] **Step 1:** `pnpm db:migrate` (aplica a 0022 por túnel SSH). Conferir que a tabela existe.
- [ ] **Step 2:** Pedir ok ao Gabriel e `git push` na `main` (Vercel + webhook do worker no Coolify). Lembrar da regra da VPS: um build por vez.
- [ ] **Step 3:** O Gabriel cola o token atual em Configurações › Apify no workspace dele (o valor está no `.env` local; ele cola, eu não imprimo).
- [ ] **Step 4:** Tirar `APIFY_TOKEN` do `.env` local e rodar `pnpm env:sync`; conferir se o script remove variáveis que sumiram ou só acrescenta. Se só acrescentar, apagar `APIFY_TOKEN` na Vercel (`vercel env rm APIFY_TOKEN production`) e no Coolify (API, app `fwkjka5bjhywdfwd7ko3a5ek`) à mão.
- [ ] **Step 5:** Criar um batch pequeno (quantidade 5) no workspace do Gabriel e ver chegar até `analisando`/`concluido`.
