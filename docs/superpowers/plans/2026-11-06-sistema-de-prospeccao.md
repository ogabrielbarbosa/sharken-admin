# Sistema de prospecção: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o app de um único usuário que vai do batch de leads até a venda e controla clientes, serviços, contratos e cobranças.

**Architecture:** Um único pacote TypeScript. O app Next.js na Vercel serve o painel, as páginas de exemplo e os webhooks. O worker Node no Mac executa as tarefas demoradas de uma tabela `jobs` no Supabase: verificar sites, gerar páginas e renderizar vídeos. As regras de negócio ficam em funções puras em `src/domain`, e as telas só chamam essas funções.

**Tech Stack:** TypeScript, Next.js (App Router), Supabase (Postgres, Auth, Storage), Apify, API do Claude (`@anthropic-ai/sdk`), ElevenLabs, ZapSign, Asaas, Remotion, Playwright, Vitest, Zod, Tailwind, Pexels.

**Spec:** `docs/superpowers/specs/2026-11-06-sistema-de-prospeccao-design.md`

**Telas:** `untitled.pen`. Leia pelo MCP do Pencil a tela citada em cada tarefa. Tokens de cor, raio e fonte vêm das variáveis do arquivo, e os componentes do painel seguem os componentes reutilizáveis dele.

## Global Constraints

- O app não envia mensagens de WhatsApp. Ele só abre a conversa com o texto preenchido, por link `wa.me`.
- Sem disparo em massa, automação de cliques, rotação de números ou variações de texto para evitar detecção.
- Um contato inicial e um follow-up por lead. Um pedido para parar coloca o telefone e o negócio em `nao_contatar` de forma permanente.
- Sem confirmação do Gabriel, o lead não muda de etapa depois do envio.
- Textos da IA usam só os dados encontrados. Preços, certificações e anos de experiência nunca são inventados.
- A sugestão de resposta não promete preço, prazo ou condição. Quando o valor for necessário, ela traz o campo `[valor]`.
- O comentário do lead nunca entra em mensagem, vídeo, página ou prompt de texto para o lead.
- A página de exemplo tem `noindex`, URL difícil de adivinhar e o aviso "Modelo preparado por [nome comercial]. Ainda não publicado".
- O vídeo diz que o modelo foi preparado para aquele negócio e não afirma que foi gravado pessoalmente para ele.
- Roteiros, mensagens e gravações ficam em arquivos do projeto, sem tela.
- O painel não contém regra de negócio. Identificadores no código ficam em inglês; etapas, fluxos e textos de tela ficam em português.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de usar uma biblioteca ou API, consulte a documentação atual pelo context7. Para a API do Claude, carregue a skill `claude-api`.

## Review Focus

- **WhatsApp ou o próprio Gabriel abrindo o link:** a prévia automática e as aberturas pelo painel não contam como abertura do lead (teste na Tarefa 8).
- **Duas unidades com o mesmo telefone:** o telefone recebe um único contato, e um pedido para parar vale para as duas (testes nas Tarefas 3 e 10).
- **Site que bloqueia robôs ou oscila:** erro 403 não é "fora do ar", e uma falha isolada não muda o fluxo (teste na Tarefa 5).
- **Nome com `&`, acentos ou quebra de linha na mensagem:** o link `wa.me` abre com o texto completo (teste na Tarefa 10).
- **Webhook repetido ou fora de ordem:** Apify, ZapSign e Asaas não duplicam registros nem regridem status (testes nas Tarefas 4, 15 e 16).

---

## Estrutura de arquivos

```
config/                               Roteiros, mensagens e prompts versionados
assets/recordings/                    Gravações do Gabriel, por fluxo
supabase/migrations/                  Tabelas, RLS e bucket
src/domain/                           Regras puras, sem acesso a rede ou banco
src/services/                         Apify, Claude, ElevenLabs, Pexels, ZapSign, Asaas, Storage
src/db/                               Consultas ao Supabase, um arquivo por entidade
src/components/ui/                    Componentes do design system
src/components/template/              Template da página de exemplo
src/app/                              Painel, /p/[slug], webhooks e cron
worker/                               index.ts e um arquivo por tipo de tarefa
remotion/                             Composição do vídeo
tests/                                Espelha src/
```

Rotas do painel:

| Rota | Telas no Pen |
|---|---|
| `/login` | 01 |
| `/painel` | 02 |
| `/painel/batches` (com `?novo=1` para o drawer) | 03 a 06 |
| `/painel/batches/[id]/revisar` | 07 e 08 |
| `/painel/batches/[id]/material` | 09 |
| `/painel/batches/[id]/abordar` | 10 e 11 |
| `/painel/batches/[id]/aguardar` | 12 |
| `/painel/batches/[id]/conversa` | 13 |
| `/painel/batches/[id]/vendido` | 14 e 15 |
| `/painel/leads/[id]` | 16 e 17 |
| `/painel/clientes` | 18 |
| `/painel/clientes/[id]` | 19 a 21 |

## Tarefas

### Tarefa 1: Base do projeto, banco, login e layout

**Files:**
- Create: projeto Next.js na raiz, `supabase/migrations/0001_init.sql`, `src/lib/env.ts`, `src/lib/supabase/{server,browser,admin}.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/painel/layout.tsx`, `src/components/ui/*`, `src/app/globals.css`, `.env.example`, `vitest.config.ts`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env`, com erro que cita a variável ausente; `createAdminClient()`, só para servidor e worker; `createServerClient()`.

- [ ] **Step 1: Criar o projeto**

Rode `npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint --use-npm --import-alias "@/*"`. Instale `@supabase/supabase-js @supabase/ssr zod` e, como dev, `vitest tsx jsdom @testing-library/react`. Adicione os scripts `test` (`vitest run`) e `worker` (`tsx worker/index.ts`). A pasta já tem `untitled.pen` e `docs`: preserve-os.

- [ ] **Step 2: Escrever o teste que falha**

`getEnv` lança um erro contendo `ANTHROPIC_API_KEY` quando ela falta e devolve o objeto validado quando as obrigatórias existem.

- [ ] **Step 3: Rodar**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar `getEnv` e `.env.example`**

Obrigatórias: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`, `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `APP_URL`, `CAPTURE_TOKEN`, `CRON_SECRET`. Com padrão: `ANTHROPIC_MODEL` (`claude-sonnet-5-5`) e `COMMERCIAL_NAME` (`Sharken`). Validadas ao usar o serviço: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `PEXELS_API_KEY`, `ZAPSIGN_API_TOKEN`, `ZAPSIGN_TEMPLATE_ID`, `ASAAS_API_KEY`, `ASAAS_BASE_URL`.

- [ ] **Step 5: Escrever a migração**

| Tabela | Colunas além de `id uuid` e `created_at` |
|---|---|
| `batches` | `location`, `location_key`, `business_type`, `quantity int`, `criteria jsonb`, `status` (`buscando`, `analisando`, `concluido`, `erro`), `error`, `apify_run_id`, `instagram_run_id` |
| `leads` | `batch_id`, `place_id unique`, `name`, `business_type`, `phone_raw`, `phone_e164`, `address`, `city`, `is_open bool`, `rating numeric`, `reviews_count int`, `images_count int`, `description`, `categories text[]`, `photos text[]`, `reviews jsonb`, `website_url`, `instagram_url`, `instagram_last_post_at`, `site_status`, `site_checks jsonb`, `site_data jsonb`, `site_signals jsonb`, `flow`, `summary`, `reason`, `comment`, `score int`, `score_reasons jsonb`, `stage`, `exit_reason`, `needs_data bool`, `error`, `contacted_at`, `follow_up_at`, `responded_at`, `sold_at`, `updated_at` |
| `sites` | `lead_id unique`, `slug unique`, `content jsonb`, `status` (`modelo`, `removido`), `expires_at` |
| `videos` | `lead_id unique`, `status` (`na_fila`, `renderizando`, `pronto`, `erro`), `progress int`, `storage_path`, `duration_seconds`, `error` |
| `jobs` | `type`, `payload jsonb`, `status` (`pendente`, `executando`, `concluido`, `erro`), `attempts int`, `run_after`, `error`, `locked_at` |
| `events` | `lead_id`, `type`, `data jsonb` |
| `do_not_contact` | `phone_e164`, `place_id`, `reason`, com índice único para cada coluna |
| `clients` | `lead_id`, `legal_name`, `document`, `contact_name`, `email`, `phone`, `address`, `location`, `asaas_customer_id` |
| `services` | `client_id`, `name`, `kind` (`unico`, `recorrente`), `amount_cents int`, `start_date`, `notes`, `status` (`ativo`, `concluido`, `cancelado`), `asaas_subscription_id` |
| `contracts` | `service_id unique`, `status` (`rascunho`, `enviado`, `assinado`, `recusado`), `zapsign_doc_token`, `sign_url`, `file_url`, `status_at` |
| `charges` | `service_id`, `description`, `amount_cents int`, `due_date`, `method` (`pix`, `boleto`, `cartao`), `status` (`pendente`, `pago`, `vencido`, `cancelado`), `payment_url`, `asaas_payment_id unique` |

Ative RLS em todas as tabelas, com política de acesso total para `authenticated` e nenhuma para `anon`. Crie o bucket público `media`.

- [ ] **Step 6: Implementar tokens, layout e login**

Copie as variáveis do Pen para `globals.css` como CSS variables. Implemente o menu lateral (Overview, Batches e Clientes), a barra superior e o login (tela 01). O middleware redireciona `/painel/*` para `/login` sem sessão. O cadastro público fica desativado, e o Gabriel cria o usuário no Supabase.

- [ ] **Step 7: Verificar**

Run: `npm test && npm run build`
Expected: testes e build passam. Com a migração aplicada, `/painel` sem sessão redireciona para `/login`.

- [ ] **Step 8: Commit** — `feat: base do projeto, banco e login`

### Tarefa 2: Etapas do lead

**Files:**
- Create: `src/domain/types.ts`, `src/domain/stages.ts`
- Test: `tests/domain/stages.test.ts`

**Interfaces:**
- Produces:
  - `type Flow = 'sem_site' | 'melhorar_site'`
  - `type SiteStatus = 'sem_link' | 'somente_social' | 'fora_do_ar' | 'funcionando'`
  - `type LeadStage`, com os estados da seção 3 da spec, com grafia idêntica
  - `type ProcessStep = 'revisar' | 'material' | 'abordar' | 'aguardar' | 'conversa' | 'vendido'`
  - `stepOf(stage: LeadStage): ProcessStep | null`
  - `canTransition(from, to): boolean`
  - `assertTransition(from, to): void`, que lança `InvalidTransitionError`

- [ ] **Step 1: Escrever os testes que falham**

Permitidas:
- `analisando→revisar`
- `revisar→gerando_material`
- `gerando_material→revisar_material`
- `revisar_material→gerando_material` (refazer)
- `revisar_material→abordar`
- `abordar→aguardando`
- `aguardando→follow_up_feito`
- `aguardando→conversa`
- `follow_up_feito→conversa`
- `conversa→vendido`
- `conversa→sem_interesse`
- de qualquer etapa não final para `descartado` ou `nao_contatar`
- de `vendido`, `descartado` ou `sem_interesse` para `nao_contatar`

Proibidas:
- `follow_up_feito→follow_up_feito`
- `aguardando→vendido`
- `revisar→abordar`
- qualquer saída de `nao_contatar`

`stepOf` agrupa `gerando_material` e `revisar_material` em `material`, `aguardando` e `follow_up_feito` em `aguardar`, e devolve `null` para `analisando` e os estados de saída.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/stages.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a tabela de transições**

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/stages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat: etapas do lead`

### Tarefa 3: Telefone, classificação do link e deduplicação

**Files:**
- Create: `src/domain/phone.ts`, `src/domain/website.ts`, `src/domain/apify-mapper.ts`
- Test: `tests/domain/phone.test.ts`, `tests/domain/website.test.ts`, `tests/domain/apify-mapper.test.ts`

**Interfaces:**
- Produces:
  - `toMobileE164(raw: string | null): string | null`
  - `classifyLink(url: string | null): { status: 'sem_link' | 'somente_social' | 'site'; instagramUrl: string | null }`
  - `mapPlaceToLead(place: ApifyPlace, batchId: string): NewLead`
  - `dedupeLeads(leads: NewLead[]): NewLead[]`

- [ ] **Step 1: Escrever os testes que falham**

```ts
expect(toMobileE164('(11) 98765-4321')).toBe('5511987654321');
expect(toMobileE164('+55 11 98765-4321')).toBe('5511987654321');
expect(toMobileE164('(11) 3456-7890')).toBeNull();
expect(toMobileE164('0800 123 4567')).toBeNull();
expect(toMobileE164(null)).toBeNull();

expect(classifyLink(null).status).toBe('sem_link');
expect(classifyLink('https://instagram.com/petlegal')).toEqual({ status: 'somente_social', instagramUrl: 'https://instagram.com/petlegal' });
expect(classifyLink('https://linktr.ee/petlegal').status).toBe('somente_social');
expect(classifyLink('https://wa.me/5511987654321').status).toBe('somente_social');
expect(classifyLink('https://petlegal.com.br').status).toBe('site');
```

Para `mapPlaceToLead`, use uma amostra com estes campos do ator `compass/crawler-google-places`: `placeId`, `title`, `phone`, `address`, `city`, `website`, `totalScore`, `reviewsCount`, `imagesCount`, `imageUrls`, `reviews`, `categories`, `categoryName`, `description`, `ownerDescription`, `permanentlyClosed`, `temporarilyClosed`. Confira que:
- `is_open` é falso se o negócio estiver fechado temporária ou permanentemente;
- as avaliações não têm autor;
- os campos ausentes viram `null` ou lista vazia.

`dedupeLeads` remove `place_id` repetido e mantém um único lead quando dois têm o mesmo `phone_e164`, preferindo o de mais avaliações. Leads sem telefone não são tratados como duplicatas entre si.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain`
Expected: FAIL nos arquivos novos.

- [ ] **Step 3: Implementar**

Celular válido: DDD de 2 dígitos, seguido de `9` e mais 8 dígitos. Domínios `somente_social`: `instagram.com`, `facebook.com`, `fb.com`, `linktr.ee`, `beacons.ai`, `bio.site`, `wa.me`, `whatsapp.com`, `tiktok.com`, `youtube.com`, `ifood.com.br`, incluindo subdomínios.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat: normalização e deduplicação de leads`

### Tarefa 4: Batches e captação

**Telas:** 03 a 06.

**Files:**
- Create: `src/services/apify.ts`, `src/domain/lead-import.ts`, `src/domain/criteria.ts`, `src/domain/batch-summary.ts`, `src/db/batches.ts`, `src/db/leads.ts`, `src/app/api/webhooks/apify/route.ts`, `src/app/painel/batches/page.tsx`, `src/app/painel/batches/actions.ts`, `src/components/batches/new-batch-drawer.tsx`
- Test: `tests/services/apify.test.ts`, `tests/domain/lead-import.test.ts`, `tests/domain/batch-summary.test.ts`

**Interfaces:**
- Consumes: `mapPlaceToLead`, `dedupeLeads`, `classifyLink`, `stepOf`.
- Produces:
  - `type Criteria` e `DEFAULT_CRITERIA`, com `minReviews: 20`, `minRating: 4`, `minPhotos: 3`, `instagramActiveDays: 90`, `recontactDays: 180`
  - `buildMapsInput(b: { location: string; businessType: string; quantity: number }): object`
  - `toLocationKey(location: string): string`
  - `startMapsRun(batchId, input): Promise<string>`
  - `startInstagramRun(batchId, urls: string[]): Promise<string>`
  - `mergeLeadOnReimport(existing: Lead, incoming: NewLead): Partial<Lead>`
  - `summarizeBatch(leads: { stage: LeadStage }[]): { counts: Record<ProcessStep, number>; nextAction: string | null }`

- [ ] **Step 1: Escrever os testes que falham**

`buildMapsInput({ location: 'Campinas, SP', businessType: 'pet shop', quantity: 50 })` devolve exatamente:

```ts
{ searchStringsArray: ['pet shop'], locationQuery: 'Campinas, SP, Brasil', maxCrawledPlacesPerSearch: 50,
  language: 'pt-BR', website: 'allPlaces', maxImages: 8, maxReviews: 5, reviewsSort: 'highestRanking',
  reviewsOrigin: 'google', scrapeReviewsPersonalData: false }
```

- `toLocationKey`: `'Campinas, SP'` e `' campinas,  sp '` geram a mesma chave.
- `mergeLeadOnReimport` atualiza nota, avaliações e fotos, mas não altera `stage`, `flow`, `contacted_at` ou `batch_id` de um lead já em `aguardando`.
- `summarizeBatch` conta por etapa e devolve a primeira ação pendente da sequência, como `'12 para revisar'`.
- O webhook recusa um segredo errado com 401.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/services/apify.test.ts tests/domain/lead-import.test.ts tests/domain/batch-summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a busca e o webhook**

- **Disparo:** a server action cria o batch e inicia o ator com webhook para `APP_URL/api/webhooks/apify?secret=...&batch=<id>&kind=maps`, nos eventos `ACTOR.RUN.SUCCEEDED`, `FAILED`, `TIMED_OUT` e `ABORTED`.
- **Importação:** o webhook lê o dataset e faz upsert por `place_id`. Em falha, importa o que veio e grava o erro no batch. "Repetir" dispara de novo sem duplicar.
- **Instagram:** com URLs, inicia `apify/instagram-profile-scraper` com `kind=instagram` para preencher `instagram_last_post_at`. Confirme o campo de data com `fetch-actor-details`. Sem URLs, ou se essa busca falhar, segue sem o dado.
- **Fim da importação:** cada lead recebe um job `analyze_lead`, e o batch fica em `analisando`.

- [ ] **Step 4: Implementar as telas**

Lista de batches com filtro de localização, contagem por etapa, próxima ação e "Repetir". Drawer em 3 passos, com validação antes de avançar. Clicar em um batch abre `/painel/batches/[id]/revisar`.

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/services/apify.test.ts tests/domain/lead-import.test.ts tests/domain/batch-summary.test.ts`
Expected: PASS. Um batch real de 5 lugares aparece na tabela `leads`, e repetir não cria novas linhas.

- [ ] **Step 6: Commit** — `feat: batches e captação pelo Apify`

### Tarefa 5: Worker, verificação de site e análise

**Files:**
- Create: `worker/index.ts`, `worker/jobs/analyze-lead.ts`, `src/domain/site-check.ts`, `src/domain/lead-analysis.ts`, `src/db/jobs.ts`, `src/services/storage.ts`, `src/services/anthropic.ts`, `config/prompts.ts`
- Test: `tests/domain/site-check.test.ts`, `tests/domain/lead-analysis.test.ts`

**Interfaces:**
- Consumes: `classifyLink`. Esta tarefa grava `site_*`, `flow`, `summary` e `reason`. A Tarefa 6 acrescenta a pontuação e a passagem para `revisar` ao mesmo job.
- Produces:
  - `interpretAttempt(a: { errorCode?: string; timedOut?: boolean; status?: number }): 'ok' | 'falha'`
  - `nextCheckStep(failuresSoFar: number): { action: 'tentar_de_novo'; delayMinutes: 5 } | { action: 'fora_do_ar' }`
  - `flowFromSiteStatus(s: SiteStatus): Flow`
  - `extractSiteData(page: Page): Promise<SiteData>`
  - `computeSiteSignals(m: { loadMs: number; https: boolean; hasViewportMeta: boolean; hasWhatsAppLink: boolean }): SiteSignal[]`
  - `analyzeLead(lead): Promise<{ summary: string; reason: string | null }>`
  - `claimNextJob(): Promise<Job | null>`, `completeJob(id)`, `failJob(id, error, retryAt?)`
  - `uploadMedia(path: string, data: Buffer, contentType: string): Promise<string>`

- [ ] **Step 1: Escrever os testes que falham**

```ts
expect(interpretAttempt({ errorCode: 'ERR_NAME_NOT_RESOLVED' })).toBe('falha');
expect(interpretAttempt({ timedOut: true })).toBe('falha');
expect(interpretAttempt({ status: 404 })).toBe('falha');
expect(interpretAttempt({ status: 503 })).toBe('falha');
expect(interpretAttempt({ status: 403 })).toBe('ok');
expect(interpretAttempt({ status: 200 })).toBe('ok');
expect(nextCheckStep(2)).toEqual({ action: 'tentar_de_novo', delayMinutes: 5 });
expect(nextCheckStep(3)).toEqual({ action: 'fora_do_ar' });
expect(flowFromSiteStatus('fora_do_ar')).toBe('sem_site');
expect(flowFromSiteStatus('funcionando')).toBe('melhorar_site');
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/site-check.test.ts tests/domain/lead-analysis.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o loop do worker**

O worker busca uma tarefa a cada 5 s com um `update ... where status='pendente' and run_after <= now()` atômico. Tarefas em `executando` há mais de 30 min voltam para `pendente`. Um erro numa tarefa não derruba o loop.

- [ ] **Step 4: Implementar `analyze-lead`**

1. `classifyLink`. Sem site próprio, o lead segue direto para a análise.
2. Com site, abra pelo Playwright com tempo limite de 20 s e siga `interpretAttempt`/`nextCheckStep`. Com resposta `ok`, salve `site_signals` e `site_data`: título, descrição, títulos, até 5.000 caracteres de texto, imagens de 300 px ou mais, `theme-color` e logo.
3. Gere o resumo e, em melhorar site, o motivo. Falha da IA: até 3 tentativas, depois grave o erro e siga sem resumo.
4. Quando não restarem jobs do batch, marque o batch como `concluido`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/domain/site-check.test.ts tests/domain/lead-analysis.test.ts`
Expected: PASS. Com `npm run worker`, um lead com site real ganha sinais e resumo, e um domínio inexistente termina como `fora_do_ar` depois da terceira tentativa.

- [ ] **Step 6: Commit** — `feat: worker, verificação de site e análise`

### Tarefa 6: ICP e Revisar

**Telas:** 07 e 08.

**Files:**
- Create: `src/domain/icp.ts`, `src/domain/review.ts`, `src/components/process/stepper.tsx`, `src/app/painel/batches/[id]/layout.tsx`, `src/app/painel/batches/[id]/revisar/page.tsx`, `src/app/painel/batches/[id]/revisar/actions.ts`
- Modify: `worker/jobs/analyze-lead.ts`
- Test: `tests/domain/icp.test.ts`, `tests/domain/review.test.ts`

**Interfaces:**
- Consumes: `assertTransition`, `Criteria`, `summarizeBatch`.
- Produces:
  - `checkEliminatory(lead, ctx: { blocked: boolean; lastContactAt: Date | null; now: Date }, c: Criteria): { passed: boolean; reasons: string[] }`
  - `scoreLead(lead, c: Criteria, now: Date): { score: number; reasons: { label: string; points: number; met: boolean }[] }`
  - `canAdvance(lead: { flow: Flow; reason: string | null }): { allowed: boolean; error?: string }`

- [ ] **Step 1: Escrever os testes que falham**

Com os valores padrão:
- **Pontuação máxima:** 20 avaliações, nota 4,0, 3 fotos, Instagram com post há 90 dias e descrição somam 100 pontos.
- **Pesos:** 25, 20, 20, 20 e 15, cada um listado na justificativa.
- **Limites:** 19 avaliações, nota 3,9, 2 fotos e último post há 91 dias não pontuam.
- **Eliminatórios:** são barrados, com o motivo escrito, um lead sem celular, um fechado, um bloqueado e um contatado há 179 dias. Um contatado há 181 dias passa.
- **Critério editado:** com `minReviews: 50`, um lead de 20 avaliações perde os 25 pontos.
- **Motivo:** `canAdvance` nega melhorar site com `reason` vazio ou só com espaços, e permite sem site com `reason: null`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/icp.test.ts tests/domain/review.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a regra e a etapa final do job**

Ao fim de `analyze-lead`, aplique os critérios do batch. Quem não passa vai para `descartado`, com o motivo em `exit_reason`. Quem passa recebe a pontuação e vai para `revisar`.

- [ ] **Step 4: Implementar a barra de etapas e a tela**

O layout do batch mostra o caminho e a barra de etapas com as contagens. A tela Revisar segue a 07: link do site em outra aba, motivo só em lead com site funcionando, comentário interno, avançar e descartar, em lote e individualmente. Avançar cria o job `generate_page`. Em lote, leads sem motivo ficam e mostram o erro.

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/domain/icp.test.ts tests/domain/review.test.ts`
Expected: PASS. A ação em lote muda só os leads selecionados.

- [ ] **Step 6: Commit** — `feat: ICP e etapa Revisar`

### Tarefa 7: Textos da página com verificação de fatos

**Files:**
- Create: `src/domain/page-readiness.ts`, `src/domain/fact-check.ts`, `src/services/page-copy.ts`
- Test: `tests/domain/page-readiness.test.ts`, `tests/domain/fact-check.test.ts`, `tests/fixtures/leads.ts`

**Interfaces:**
- Produces:
  - `type PageCopy = { headline: string; subheadline: string; about: string | null; services: { name: string; description: string | null }[]; cta: string }`
  - `checkReadiness(lead): { ready: boolean; missing: string[] }`
  - `buildSourceText(lead): string`, que nunca inclui `comment`
  - `findUnsupportedClaims(copy: PageCopy, sourceText: string): string[]`
  - `generatePageCopy(lead, flow: Flow): Promise<PageCopy>`

- [ ] **Step 1: Escrever os testes que falham**

Readiness: sem nome, telefone, endereço ou serviço, o lead não está pronto e os campos faltantes são listados. A categoria conta como serviço. `buildSourceText` não contém o texto do comentário.

Com a fonte `Pet shop em Campinas. Banho e tosa.`, `findUnsupportedClaims` aponta `R$ 50`, `10 anos de experiência`, `certificado` e o serviço `Veterinário 24h`. Não aponta o serviço `Banho e tosa`, nem um preço que esteja na fonte.

As fixtures têm um lead completo de cada fluxo, um sem avaliações, um sem fotos, um sem descrição e um com caracteres especiais no nome.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/page-readiness.test.ts tests/domain/fact-check.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`findUnsupportedClaims` compara com a fonte, ignorando acentos e maiúsculas, todo valor em dinheiro, percentual, tempo ("X anos") e termos de credencial (`certificad`, `credenciad`, `premiad`, `especialista`, `líder`, `melhor`, `garantia`), além dos nomes de serviço. Um nome de serviço é aceito se todas as suas palavras de 4 letras ou mais estiverem na fonte. `generatePageCopy` usa saída estruturada, e o prompt em `config/prompts.ts` proíbe fatos fora dos dados recebidos.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/page-readiness.test.ts tests/domain/fact-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat: textos da página com verificação de fatos`

### Tarefa 8: Template e página pública

**Files:**
- Create: `src/domain/colors.ts`, `src/domain/site-access.ts`, `src/components/template/*.tsx`, `src/app/p/[slug]/page.tsx`, `src/app/api/open/route.ts`
- Test: `tests/domain/colors.test.ts`, `tests/domain/site-access.test.ts`, `tests/components/template.test.tsx`

**Interfaces:**
- Consumes: `PageCopy`, `stepOf`.
- Produces:
  - `type SiteContent = { copy: PageCopy; business: { name; phoneE164; address; city; mapsQuery }; photos: { url: string; stock: boolean }[]; reviews: { text: string; stars: number }[]; colors: { primary: string; onPrimary: string }; videoUrl?: string }`
  - `resolveColors(themeColor: string | null): { primary: string; onPrimary: string }`
  - `getSiteAccess(site, now): 'ok' | 'indisponivel'`
  - `shouldRecordOpen(ctx: { stage: LeadStage; isAdmin: boolean; isCapture: boolean }): boolean`
  - `<SiteTemplate content={SiteContent} commercialName={string} showVideo={boolean} />`

- [ ] **Step 1: Escrever os testes que falham**

- `getSiteAccess`: `modelo` vencido e `removido` devolvem `indisponivel`.
- `shouldRecordOpen`: só é verdadeiro a partir de `aguardando`, e falso para administrador ou captura.
- `resolveColors('#ffffff')` tem texto escuro, `resolveColors('#000000')` tem texto claro, e valor inválido cai na cor padrão.
- O template renderiza para todas as fixtures. Sem avaliações, a seção some. Foto `stock: true` mostra "Imagem ilustrativa". O aviso com o nome comercial sempre aparece, e o botão aponta para `https://wa.me/<telefone>`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/colors.test.ts tests/domain/site-access.test.ts tests/components/template.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar o template e a rota**

O template funciona bem no celular, com as seções na ordem da spec. A rota `/p/[slug]` envia `robots: noindex, nofollow`. Página indisponível devolve status 410 com uma mensagem neutra. Com `?captura=<CAPTURE_TOKEN>`, o vídeo some e a abertura não é registrada.

A abertura é registrada por um `fetch` no navegador para `/api/open`, para que a prévia do WhatsApp, que não executa JavaScript, não conte. Sessão logada conta como administrador.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/colors.test.ts tests/domain/site-access.test.ts tests/components/template.test.tsx`
Expected: PASS. A página de cada fixture fica correta em 390 px e em 1280 px.

- [ ] **Step 5: Commit** — `feat: template e página de exemplo`

### Tarefa 9: Geração em lote e Material

**Tela:** 09.

**Files:**
- Create: `config/video.ts`, `worker/jobs/generate-page.ts`, `src/services/pexels.ts`, `src/domain/material.ts`, `src/app/painel/batches/[id]/material/page.tsx`, `src/app/painel/batches/[id]/material/actions.ts`
- Test: `tests/domain/material.test.ts`

**Interfaces:**
- Consumes: `checkReadiness`, `generatePageCopy`, `findUnsupportedClaims`, `resolveColors`, `uploadMedia`.
- Produces:
  - `VIDEO_ENABLED: Record<Flow, boolean>`, em `config/video.ts`, com os dois valores iniciais `false`
  - `newSiteSlug(): string`
  - `expiryFrom(now: Date): Date`
  - `isMaterialReady(a: { siteReady: boolean; videoEnabled: boolean; videoStatus: VideoStatus | null }): boolean`
  - `needsStockPhotos(own: string[]): boolean`

- [ ] **Step 1: Escrever os testes que falham**

- `newSiteSlug` gera 22 caracteres ou mais, em base64url, e dois valores diferentes.
- `expiryFrom` soma 30 dias.
- `isMaterialReady` é verdadeiro com a página pronta e o vídeo desligado, falso com vídeo ligado e `na_fila`, e verdadeiro com `pronto`.
- `needsStockPhotos` é verdadeiro com menos de 3 fotos próprias.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/material.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `generate-page`**

1. Sem dados suficientes, marque `needs_data` e encerre sem gerar a página.
2. Gere os textos. Com afirmações sem apoio ou erro da IA, tente até 3 vezes. Depois disso, grave o erro no lead e encerre sem travar o lote.
3. Copie as fotos para o Storage, porque as URLs do Google expiram. Em melhorar site, inclua as fotos e cores de `site_data`.
4. Salve o `site`. Com vídeo ligado no fluxo, crie o job `render_video`. Com o material pronto, avance para `revisar_material`.

- [ ] **Step 4: Implementar a tela**

Segue a 09. "Em geração" mostra status, progresso e "Tentar de novo". "Prontos para revisão" mostra o vídeo, "Abrir página", "Aprovar" e "Refazer". Inclua os leads marcados por falta de dados, com os campos faltantes.

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/domain/material.test.ts`
Expected: PASS. Um lead fictício de cada fluxo é gerado e aprovado, e os textos contêm só os dados de origem.

- [ ] **Step 6: Commit** — `feat: geração em lote e etapa Material`

### Tarefa 10: Abordar e Aguardar

**Telas:** 10 a 12.

**Files:**
- Create: `config/messages.ts`, `src/domain/messages.ts`, `src/domain/contact-rules.ts`, `src/db/contact.ts`, `src/app/painel/batches/[id]/abordar/page.tsx`, `src/app/painel/batches/[id]/aguardar/page.tsx`, `src/app/painel/batches/[id]/contact-actions.ts`
- Test: `tests/domain/messages.test.ts`, `tests/domain/contact-rules.test.ts`

**Interfaces:**
- Produces:
  - `renderMessage(template: string, vars: MessageVars): string`, que lança erro se sobrar um campo sem valor
  - `selectFirstMessage(lead): string`
  - `buildWhatsAppLink(phoneE164: string, text: string): string`
  - `canContact(lead, ctx: { blocked: boolean; now: Date; lastContactAt: Date | null }): { allowed: boolean; reason?: string }`
  - `isFollowUpDue(lead, now: Date): boolean`
  - `blockEntry(lead): { phone_e164; place_id; reason }`

- [ ] **Step 1: Escrever os testes que falham**

```ts
const link = buildWhatsAppLink('5511987654321', 'Oi, Pão & Café!\nVeja: https://x.co/p/a');
expect(link.startsWith('https://wa.me/5511987654321?text=')).toBe(true);
expect(new URL(link).searchParams.get('text')).toBe('Oi, Pão & Café!\nVeja: https://x.co/p/a');
```

- **Mensagens:** `selectFirstMessage` usa o modelo do fluxo, com um modelo próprio para `site_status = 'fora_do_ar'`. Em melhorar site, `[motivo]` recebe `lead.reason`. O texto de `lead.comment` nunca aparece no resultado.
- **Bloqueios:** `canContact` nega lead bloqueado, fora de `abordar`, sem celular, ou com outro lead do mesmo telefone contatado há menos de 180 dias.
- **Follow-up:** `isFollowUpDue` é falso com 2 dias e 23 h e verdadeiro com 3 dias, em `aguardando`. É falso em `follow_up_feito`, `conversa` e `nao_contatar`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/messages.test.ts tests/domain/contact-rules.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar as regras e `config/messages.ts`**

Copie as quatro mensagens da seção 7 da spec.

- [ ] **Step 4: Implementar as telas**

- **Abordar:** segue a 10 e a 11. Mensagem editável. "Abrir no WhatsApp" abre o link e registra `conversa_aberta`, sem mudar a etapa. "Confirmar envio" muda a etapa. "Número inválido" descarta. "Pediu para parar" move para `nao_contatar` e grava em `do_not_contact`.
- **Envios hoje:** conta todos os batches. Passar de 20 mostra um aviso, sem bloquear.
- **Aguardar:** segue a 12, com os vencidos no topo, a mensagem editável e o botão "Respondeu".

`canContact` é verificado de novo no servidor em cada ação.

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/domain/messages.test.ts tests/domain/contact-rules.test.ts`
Expected: PASS. No navegador, o link abre o WhatsApp com o texto certo, e um lead sem confirmação continua na mesma etapa.

- [ ] **Step 6: Commit** — `feat: etapas Abordar e Aguardar`

### Tarefa 11: Módulo de vídeo

**Files:**
- Create: `config/scripts.ts`, `src/domain/script.ts`, `src/domain/video-timing.ts`, `src/services/elevenlabs.ts`, `remotion/index.ts`, `remotion/ProposalVideo.tsx`, `worker/jobs/render-video.ts`
- Modify: `config/video.ts`
- Test: `tests/domain/script.test.ts`, `tests/domain/video-timing.test.ts`

**Interfaces:**
- Consumes: `isMaterialReady`, `uploadMedia`.
- Produces:
  - `type ScriptSegment = { kind: 'fixed'; id: string; text: string } | { kind: 'slot'; slot: 'nome' | 'cidade' | 'tipo' | 'motivo' }`
  - `parseScript(text: string): ScriptSegment[]`
  - `findMissingRecordings(segments, available: string[]): string[]`
  - `buildTimeline(segments: { durationSeconds: number }[], fps: 30): { from: number; durationInFrames: number }[]`
  - `checkDuration(seconds: number): 'ok' | 'curto' | 'longo'`
  - `synthesizeSlot(text: string): Promise<Buffer>`, com cache no Storage pelo hash do texto
  - comando `npm run script:list`, que lista os trechos fixos por fluxo e quais gravações faltam
  - composição `ProposalVideo`, com props `{ narration: { src: string; from: number; durationInFrames: number }[]; beforeSiteSrc?: string; pageScrollSrc: string; businessName: string; city: string }`

- [ ] **Step 1: Escrever os testes que falham**

- `parseScript('Oi, pessoal da [nome do negócio]! Aqui é o Gabriel.')` devolve um trecho fixo, o campo `nome` e outro trecho fixo.
- O `id` de um trecho fixo é um hash do texto: alterar uma frase invalida só a gravação dela.
- Um campo desconhecido, como `[preço]`, lança erro com o nome do campo.
- `findMissingRecordings` lista os trechos sem áudio.
- `buildTimeline([{ durationSeconds: 2 }, { durationSeconds: 1.5 }], 30)` devolve `from` 0 e 60, e durações 60 e 45.
- `checkDuration`: 59 é `curto`, 60 e 90 são `ok`, 91 é `longo`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/script.test.ts tests/domain/video-timing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a configuração**

`config/scripts.ts` guarda os dois roteiros da seção 6 da spec. `config/video.ts` guarda `VIDEO_ENABLED` e `VOICE_MODE: Record<Flow, 'emenda' | 'clone_total'>`. As gravações ficam em `assets/recordings/<fluxo>/<id>.mp3`.

- [ ] **Step 4: Implementar `render-video`**

Instale `remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`, `music-metadata` e `playwright`. Consulte a skill `remotion`.

1. Monta a narração. Em `emenda`, usa as gravações mais os campos do ElevenLabs. Em `clone_total`, gera o texto inteiro.
2. Grava a rolagem de `/p/<slug>?captura=<CAPTURE_TOKEN>` em 1280×720. Em melhorar site, também grava o site atual.
3. Renderiza o MP4 com `ProposalVideo`, mostrando nome e cidade na tela e atualizando `videos.progress`.
4. Salva `duration_seconds`, publica, grava `videoUrl` em `sites.content` e, com `isMaterialReady` verdadeiro, avança o lead para `revisar_material`. Duração fora de 60 a 90 s aparece como alerta em Material.
5. Com falha da voz, tenta até 3 vezes. Gravação faltando gera erro claro, como na tela 09. Depois, marca o erro sem travar a fila.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/domain/script.test.ts tests/domain/video-timing.test.ts`
Expected: PASS. Com áudio de teste, um lead fictício de cada fluxo gera um MP4 que toca na página e no celular. Depois, as emendas são afinadas com as gravações do Gabriel.

- [ ] **Step 6: Commit** — `feat: módulo de vídeo`

### Tarefa 12: Conversa e Vendido

**Telas:** 13 a 15.

**Files:**
- Create: `src/services/reply-suggestions.ts`, `src/domain/client-form.ts`, `src/components/clients/client-drawer.tsx`, `src/db/clients.ts`, `src/app/painel/batches/[id]/conversa/page.tsx`, `src/app/painel/batches/[id]/conversa/actions.ts`, `src/app/painel/batches/[id]/vendido/page.tsx`, `src/app/painel/batches/[id]/vendido/actions.ts`
- Test: `tests/domain/reply-prompt.test.ts`, `tests/domain/client-form.test.ts`

**Interfaces:**
- Consumes: `blockEntry`, `assertTransition`.
- Produces:
  - `buildReplyPrompt(lead, incomingText: string): { system: string; user: string }`
  - `suggestReply(lead, incomingText: string): Promise<string>`
  - `validateDocument(document: string): boolean`
  - `clientDraftFromLead(lead): ClientDraft`

- [ ] **Step 1: Escrever os testes que falham**

- `buildReplyPrompt` inclui os dados do lead, não inclui o comentário e proíbe prometer preço, prazo ou condição, orientando o uso de `[valor]`.
- `validateDocument` aceita CPF e CNPJ válidos, com ou sem pontuação, e recusa dígitos verificadores errados.
- `clientDraftFromLead` preenche nome, telefone e endereço.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/reply-prompt.test.ts tests/domain/client-form.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Conversa segue a 13: "Sugerir resposta" nunca envia nada, e `[valor]` fica destacado. Vendido segue a 14. O drawer da 15 salva o cliente e abre a tela dele com o drawer de novo serviço. O mesmo drawer, vazio, atende "Novo cliente".

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/reply-prompt.test.ts tests/domain/client-form.test.ts`
Expected: PASS. Uma venda aparece em Vendido, e cadastrar o cliente muda a coluna para "Cadastrado".

- [ ] **Step 5: Commit** — `feat: etapas Conversa e Vendido`

### Tarefa 13: Lead

**Telas:** 16 e 17.

**Files:**
- Create: `src/domain/lead-actions.ts`, `src/app/painel/leads/[id]/page.tsx`, `src/app/painel/leads/[id]/actions.ts`
- Test: `tests/domain/lead-actions.test.ts`

**Interfaces:**
- Produces: `availableActions(lead): LeadAction[]`, `describeEvent(event): string`.

- [ ] **Step 1: Escrever os testes que falham**

- `availableActions` em `aguardando` inclui `respondeu`, `descartar`, `nao_contatar` e `remover_modelo`.
- Em `vendido`, inclui `remover_modelo`, sem `descartar`.
- Em `nao_contatar`, não inclui ação de contato.
- `describeEvent` traduz cada tipo de evento para o texto do histórico.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/lead-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar a tela**

Segue a 16 e a 17, incluindo motivo editável até a abordagem, comentário interno, "Remover modelo", que tira a página do ar na hora, e "Ver cliente". Clicar no nome do lead em qualquer etapa abre esta tela. "Voltar" usa a etapa atual do lead.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/lead-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat: tela do lead`

### Tarefa 14: Clientes e serviços

**Telas:** 18 a 20.

**Files:**
- Create: `src/domain/finance.ts`, `src/db/services.ts`, `src/db/charges.ts`, `src/app/painel/clientes/page.tsx`, `src/app/painel/clientes/[id]/page.tsx`, `src/app/painel/clientes/[id]/actions.ts`
- Test: `tests/domain/finance.test.ts`

**Interfaces:**
- Produces:
  - `summarizeCharges(charges: { amountCents: number; status: ChargeStatus }[]): { invoiced: number; received: number; open: number; overdue: number }`
  - `clientStanding(charges): 'em_dia' | 'em_atraso'`
  - `formatBRL(cents: number): string`

- [ ] **Step 1: Escrever os testes que falham**

Com as cobranças da tela 19 (600 pago, 600 pendente, 250 vencido, 89 pendente, 350 cancelado):

```ts
expect(summarizeCharges(charges)).toEqual({ invoiced: 153900, received: 60000, open: 93900, overdue: 25000 });
expect(clientStanding(charges)).toBe('em_atraso');
expect(formatBRL(153900).replace(/\s/g, ' ')).toBe('R$ 1.539,00');
```

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/finance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar as telas**

Clientes segue a 18, com totais e busca. Cliente segue a 19. O drawer Novo serviço segue a 20 e cria o contrato como rascunho. Um menu "…" em cada linha traz editar cliente e concluir ou cancelar serviço. As seções de contratos e cobranças mostram os dados, e as ações externas chegam nas Tarefas 15 e 16.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/domain/finance.test.ts`
Expected: PASS. Criar cliente e serviço pelo navegador atualiza a lista.

- [ ] **Step 5: Commit** — `feat: clientes e serviços`

### Tarefa 15: Contratos pelo ZapSign

**Files:**
- Create: `src/services/zapsign.ts`, `src/domain/contract-status.ts`, `src/app/api/webhooks/zapsign/route.ts`
- Modify: `src/app/painel/clientes/[id]/actions.ts`, `src/app/painel/clientes/[id]/page.tsx`
- Test: `tests/services/zapsign.test.ts`, `tests/domain/contract-status.test.ts`

**Interfaces:**
- Produces:
  - `buildContractPayload(client, service): object`
  - `sendContract(client, service): Promise<{ docToken: string; signUrl: string }>`
  - `nextContractStatus(current: ContractStatus, event: string): ContractStatus`

- [ ] **Step 1: Escrever os testes que falham**

- `buildContractPayload` envia o modelo de `ZAPSIGN_TEMPLATE_ID`, o signatário e os campos nome, documento, serviço, valor e data, com `disable_signer_emails` conforme a documentação atual.
- `nextContractStatus`: `enviado` + documento assinado vira `assinado`; `enviado` + recusa vira `recusado`; `assinado` + evento repetido continua `assinado`.
- O webhook recusa um segredo errado com 401 e ignora um documento desconhecido com 200.
- Sem `ZAPSIGN_TEMPLATE_ID`, `sendContract` lança erro dizendo que falta o modelo.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/services/zapsign.test.ts tests/domain/contract-status.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Confirme na documentação atual da ZapSign os campos de criação a partir de modelo e os eventos de webhook. Ações na tela: "Enviar para assinatura", reenviar um recusado, copiar o link de assinatura e "Abrir contrato". Falha da API mantém o status local e mostra o erro.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/services/zapsign.test.ts tests/domain/contract-status.test.ts`
Expected: PASS. Quando o modelo existir, um contrato no ambiente de teste é assinado e o status muda sozinho.

- [ ] **Step 5: Commit** — `feat: contratos pelo ZapSign`

### Tarefa 16: Cobranças pelo Asaas

**Tela:** 21.

**Files:**
- Create: `src/services/asaas.ts`, `src/domain/charge-status.ts`, `src/app/api/webhooks/asaas/route.ts`
- Modify: `src/app/painel/clientes/[id]/actions.ts`, `src/app/painel/clientes/[id]/page.tsx`
- Test: `tests/services/asaas.test.ts`, `tests/domain/charge-status.test.ts`

**Interfaces:**
- Produces:
  - `buildCustomerPayload(client): object`, com `notificationDisabled: true`
  - `buildPaymentPayload(charge, customerId): object`
  - `buildSubscriptionPayload(charge, customerId, cycle: 'MONTHLY'): object`
  - `toAsaasBillingType(method: ChargeMethod): 'PIX' | 'BOLETO' | 'CREDIT_CARD'`
  - `nextChargeStatus(current: ChargeStatus, event: string): ChargeStatus`

- [ ] **Step 1: Escrever os testes que falham**

- `buildPaymentPayload` converte centavos para reais: 8900 vira `value: 89`, com `dueDate` em `YYYY-MM-DD`.
- `nextChargeStatus`: `pendente` + `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` vira `pago`; `pendente` + `PAYMENT_OVERDUE` vira `vencido`; `vencido` + `PAYMENT_RECEIVED` vira `pago`; `pago` + `PAYMENT_OVERDUE` repetido continua `pago`; `PAYMENT_DELETED` vira `cancelado`.
- O webhook recusa um token errado com 401, e o mesmo evento duas vezes não cria nem altera nada além do status.
- Uma cobrança nova de assinatura recebida por webhook cria a linha em `charges`, ligada ao serviço, sem duplicar por `asaas_payment_id`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/services/asaas.test.ts tests/domain/charge-status.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Confirme a API atual do Asaas no ambiente de teste, com `ASAAS_BASE_URL`. O cliente é criado no Asaas na primeira cobrança. O drawer segue a 21, com periodicidade só para serviço recorrente. Ações na tela: "Copiar link de pagamento", e "Cancelar cobrança" no menu "…". Falha da API mantém o estado local e mostra o erro no drawer.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/services/asaas.test.ts tests/domain/charge-status.test.ts`
Expected: PASS. No ambiente de teste, uma cobrança paga muda sozinha para "Pago", e o resumo financeiro acompanha.

- [ ] **Step 5: Commit** — `feat: cobranças pelo Asaas`

### Tarefa 17: Overview, retenção e deploy

**Tela:** 02.

**Files:**
- Create: `src/domain/metrics.ts`, `src/domain/retention.ts`, `src/app/painel/page.tsx`, `src/app/api/cron/retention/route.ts`, `vercel.json`, `docs/operacao.md`
- Test: `tests/domain/metrics.test.ts`, `tests/domain/retention.test.ts`

**Interfaces:**
- Consumes: `summarizeCharges`, `stepOf`.
- Produces:
  - `summarizeResults(rows: ResultRow[]): { totals: Summary; byFlow: Summary[]; byBusinessType: Summary[]; funnel: FunnelStep[] }`, com `Summary = { key: string; contacts: number; opens: number; replies: number; sales: number }`
  - `buildPendencies(input): { kind: string; count: number; batchIds: string[] }[]`
  - `pendencyHref(p): string`
  - `shouldDeleteLead(lead, now: Date): boolean`
  - `shouldRemoveSite(site, now: Date): boolean`

- [ ] **Step 1: Escrever os testes que falham**

- `summarizeResults` conta uma abertura por lead mesmo com várias aberturas e não conta descartados como contato.
- `pendencyHref` abre o batch direto com um único batch, e a lista de Batches filtrada pela etapa com vários.
- Lead sem resposta é removido com 180 dias desde o último contato, ou desde a criação se nunca foi contatado, e não é removido com 179.
- Lead em `conversa`, `vendido`, ou ligado a um cliente, não é removido.
- Modelo com mais de 30 dias é removido, e remover um lead nunca apaga a linha em `do_not_contact`.

- [ ] **Step 2: Rodar**

Run: `npx vitest run tests/domain/metrics.test.ts tests/domain/retention.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Overview segue a 02, com filtros de localização e período, pendências, cards e gráficos. O cron diário da Vercel, protegido por `CRON_SECRET`, aplica a retenção. `docs/operacao.md` lista a configuração das contas, como iniciar o worker, como trocar roteiros e gravações, e a checagem de LGPD antes do primeiro contato.

- [ ] **Step 4: Rodar**

Run: `npm test && npm run build`
Expected: todos passam.

- [ ] **Step 5: Fazer o teste manual completo**

Faça o deploy na Vercel com o domínio definido pelo Gabriel, ou o padrão da Vercel. Um lead fictício de cada fluxo, com o telefone do próprio Gabriel, percorre todas as etapas até virar cliente, com contrato e cobrança nos ambientes de teste.

Expected: nenhuma etapa quebra, o link abre o WhatsApp sem enviar nada, a página tem `noindex`, e o lead em `nao_contatar` não volta para a fila.

- [ ] **Step 6: Commit** — `feat: overview, retenção e guia de operação`
