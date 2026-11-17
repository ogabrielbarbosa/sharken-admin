# MCP de leitura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endpoint MCP remoto e somente leitura em `https://admin.sharkenapps.com/api/mcp`, com login OAuth 2.1 do Supabase, para ler batches, leads (com imagens) e atendimentos dos workspaces do usuário.

**Architecture:** O Supabase Auth do `supa-sharken` vira servidor OAuth 2.1 (registro dinâmico) e manda o usuário para a tela `/oauth/consent` do Next.js. A rota `/api/mcp` (Streamable HTTP, sem estado) valida o token, descobre os workspaces acessíveis e responde às ferramentas com um cliente admin envolto num proxy que só deixa ler. Uma migração impede que tokens OAuth gravem pela REST do Supabase.

**Tech Stack:** Next.js 16 (App Router) na Vercel, `@supabase/supabase-js` 2.119 (`auth.oauth.*`), `@modelcontextprotocol/sdk` + `mcp-handler`, `sharp` (redimensionar imagem), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-17-mcp-leitura-design.md`

## Global Constraints

- Nada de escrita a partir do MCP: toda leitura passa pelo `readOnlyDb` (Task 2); toda ferramenta declara `readOnlyHint: true`.
- O MCP nunca lê `workspace_billing`, `workspace_invites`, `jobs`, `clients`, `services`, `contracts`, `charges`.
- Id de outro workspace responde "não encontrado" (nunca "sem permissão").
- Texto de terceiros (avaliações, legendas, mensagens, texto extraído) vai marcado como conteúdo externo.
- Nomes de ferramentas e textos em português. Colunas: `novo`, `qualificado`, `pagina`, `video`, `pronto`, `descartados` (`PIPELINE_COLUMNS`).
- Migração compatível com o código publicado; nunca rodar comando que apague dados. Aplicar com `pnpm db:migrate`.
- Reiniciar o container de auth do Supabase só depois de o Gabriel confirmar.
- Buckets: `lead-assets` (material, privado), `whatsapp-media` (mensagens, privado). Link assinado: 3600 s.
- Imagens: padrão 8 por chamada, máximo 20; redimensionar acima de ~1 MB.

## Review Focus

- Membro chamando `ver_lead`/`ver_batch`/`ver_atendimento` com id de outro workspace: tem que vir "não encontrado" (teste na Task 3).
- Admin sem `workspace` nas listas: lista de todos os workspaces, cada item com o nome do workspace (teste na Task 3).
- Usuário logado sem nenhum workspace: o token é válido, mas as ferramentas devem responder lista vazia ou "não encontrado", nunca erro 500 (teste na Task 3).
- Lead sem Instagram, sem fotos e sem material em `ver_imagens_do_lead`: resposta com o aviso "sem imagens", sem lançar erro (teste na Task 5).
- Imagem do R2/Maps que dá 404 ou demora: vira só o link com aviso, e as outras imagens continuam saindo (teste na Task 5).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0020_oauth_somente_leitura.sql` | `is_oauth_session()` e políticas restritivas contra escrita por token OAuth |
| `packages/db/src/read-only.ts` | `readOnlyDb(db)`: proxy que lança erro em escrita e rpc |
| `packages/db/src/mcp-read.ts` | consultas do MCP, já filtradas pelos workspaces acessíveis |
| `packages/domain/src/briefing.ts` | `buildBriefing` passa a receber resolvedor de imagem do material |
| `apps/web/src/lib/mcp/access.ts` | `resolveAccess(token)`: usuário → workspaces acessíveis |
| `apps/web/src/lib/mcp/images.ts` | baixar, redimensionar e montar blocos de imagem |
| `apps/web/src/lib/mcp/tools.ts` | registro das 8 ferramentas sobre um `McpServer` |
| `apps/web/src/app/api/mcp/route.ts` | rota MCP com `withMcpAuth` |
| `apps/web/src/app/.well-known/oauth-protected-resource/route.ts` | metadados do recurso protegido |
| `apps/web/src/app/oauth/consent/page.tsx` + `actions.ts` | tela de consentimento |
| `apps/web/src/app/login/actions.ts` + `page.tsx` | aceitar `next` (só caminho relativo) |

---

### Task 1: Migração que impede escrita por token OAuth

**Files:**
- Create: `supabase/migrations/0020_oauth_somente_leitura.sql`
- Test: `packages/db/tests/migrations.test.ts`

**Interfaces:**
- Produces: função SQL `public.is_oauth_session() returns boolean` (plpgsql, `stable`, lê `auth.jwt() ->> 'client_id'`; plpgsql para o PGlite aceitar sem schema `auth`, como `is_workspace_member`). Política `<tabela>_no_oauth_write` em cada tabela.

- [ ] **Step 1: Escrever os testes que falham** em `migrations.test.ts`:

```ts
it('cria política restritiva contra escrita por OAuth em toda tabela que authenticated grava', async () => {
  const { rows } = await db.query<{ tablename: string }>(`
    select distinct tablename from pg_policies
    where schemaname = 'public' and 'authenticated' = any(roles) and cmd <> 'SELECT' and permissive = 'PERMISSIVE'
    except
    select tablename from pg_policies where policyname = tablename || '_no_oauth_write' and permissive = 'RESTRICTIVE'`);
  expect(rows).toEqual([]);
});

it('a política de OAuth não restringe select', async () => {
  const { rows } = await db.query<{ cmd: string }>(`select distinct cmd from pg_policies where policyname like '%_no_oauth_write'`);
  expect(rows.map((r) => r.cmd).sort()).toEqual(['DELETE', 'INSERT', 'UPDATE']);
});
```

Uma política por comando (`_no_oauth_write` serve de prefixo: `<t>_no_oauth_write_ins`, `_upd`, `_del`): ajustar o `except` acima para `policyname like tablename || '_no_oauth_write%'`.

- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/db test migrations` → FAIL (lista com `leads`, `contacts`, …).

- [ ] **Step 3: Escrever a 0020.** Cria `is_oauth_session()` (`revoke` de `public, anon`; `grant execute` a `authenticated, service_role`). Bloco `do $$` que percorre `select distinct tablename from pg_policies where schemaname='public' and 'authenticated' = any(roles) and cmd <> 'SELECT'` e cria, `as restrictive ... to authenticated`: `for insert with check (not is_oauth_session())`, `for update using (not is_oauth_session())`, `for delete using (not is_oauth_session())`. `drop policy if exists` antes de cada uma (idempotente). Comentário no topo explicando o porquê (token do cliente MCP é sessão `authenticated` comum).

- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @lps/db test` → PASS (todos).

- [ ] **Step 5: Commit.** `git add supabase/migrations/0020_oauth_somente_leitura.sql packages/db/tests/migrations.test.ts && git commit -m "feat(db): token OAuth não grava pela REST do Supabase"`

---

### Task 2: Cliente só de leitura

**Files:**
- Create: `packages/db/src/read-only.ts`
- Modify: `packages/db/src/index.ts` (exportar)
- Test: `packages/db/tests/read-only.test.ts`

**Interfaces:**
- Produces: `readOnlyDb(db: Db): Db` e `const READ_ONLY_ERROR = 'MCP é somente leitura.'`. `from(t)` devolve a query original, mas `insert`, `update`, `upsert`, `delete` lançam `READ_ONLY_ERROR`; `rpc` lança também; `storage.from(b)` só permite `createSignedUrl`, `createSignedUrls`, `download` (o resto lança). Funciona por cima de `scopeDb`.

- [ ] **Step 1: Teste que falha** (PGlite + `fakeDb`, como `scope.test.ts`):

```ts
it('lê normalmente', async () => { const ro = readOnlyDb(fakeDb(pg)); const { data } = await ro.from('batches').select('*'); expect(Array.isArray(data)).toBe(true); });
it.each(['insert', 'update', 'upsert', 'delete'])('lança em %s', (op) => {
  const ro = readOnlyDb(fakeDb(pg));
  expect(() => (ro.from('leads') as any)[op]({})).toThrow(READ_ONLY_ERROR);
});
it('lança em rpc', () => expect(() => readOnlyDb(fakeDb(pg)).rpc('crm_chat_counts')).toThrow(READ_ONLY_ERROR));
```

(Se o `fakeDb` não tiver `storage`, o teste de storage usa um objeto falso `{ storage: { from: () => ({ createSignedUrl, upload, remove }) } }` e confere que `upload`/`remove` lançam.)

- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/db test read-only` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar** com `Proxy`, no mesmo estilo de `scopeDb` (`packages/db/src/scope.ts`).
- [ ] **Step 4: Rodar e ver passar.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): cliente só de leitura para o MCP"`

---

### Task 3: Consultas do MCP com escopo de workspaces

**Files:**
- Create: `packages/db/src/mcp-read.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/tests/mcp-read.test.ts`

**Interfaces:**
- Consumes: `readOnlyDb` (Task 2), `columnOf`, `PIPELINE_COLUMNS`, `PipelineColumn` de `@lps/domain`, `fetchAll`.
- Produces (todas recebem `db: Db` já `readOnlyDb`, sem `scopeDb`, e `access: Access`):

```ts
export type Access = { userId: string; isAdmin: boolean; workspaces: { id: string; name: string; slug: string; role: 'owner' | 'member' }[] };
/** Restringe ao workspace pedido (id ou slug) ou devolve todos os acessíveis; pedido fora do acesso → []. */
export function workspaceFilter(access: Access, workspace?: string): string[];
export type LeadSummary = { id: string; workspace: string; batch_id: string | null; name: string; column: PipelineColumn; stage: LeadStage; flow: Flow | null; score: number | null; city: string | null; business_type: string | null; phone: string | null; website_url: string | null; instagram_url: string | null; has_instagram_media: boolean; page_url: string | null; loom_url: string | null; contacts: number; stage_changed_at: string };
export function mcpListBatches(db, access, o: { workspace?: string; status?: BatchStatus; limit?: number }): Promise<(Batch & { workspace: string; columns: Record<PipelineColumn, number> })[]>;
export function mcpGetBatch(db, access, batchId: string): Promise<{ batch: Batch & { workspace: string }; columns: Record<PipelineColumn, LeadSummary[]> } | null>;
export function mcpListLeads(db, access, o: { batchId?: string; column?: PipelineColumn; workspace?: string; search?: string; limit?: number; cursor?: string }): Promise<{ leads: LeadSummary[]; next: string | null }>;
export function mcpGetLead(db, access, leadId: string): Promise<{ lead: Lead; workspace: string; assets: LeadAsset[]; contacts: Contact[] } | null>;
export function mcpListChats(db, access, o: { workspace?: string; state?: ChatState; status?: ContactStatus; batchId?: string; limit?: number; cursor?: string }): Promise<{ chats: (Contact & { workspace: string; lead: { id: string; name: string } | null })[]; next: string | null }>;
export function mcpGetChat(db, access, contactId: string, limit?: number): Promise<{ contact: Contact; workspace: string; lead: LeadSummary | null; messages: Message[] } | null>;
```

Regras: `limit` padrão 50 (máx. 200) nas listas, 100 mensagens (máx. 500) em `mcpGetChat`, mensagens em ordem cronológica (as N mais recentes). Cursor opaco (offset em base64 basta). Funções por id fazem `.in('workspace_id', ids)` e devolvem `null` fora do acesso. `assets` só `status = 'pronto'`.

- [ ] **Step 1: Testes que falham.** Setup igual a `scope.test.ts` (workspaces `sharken` e `primo`, um batch e leads em etapas diferentes em cada, um contato com mensagens em cada). Casos:
  - `mcpGetLead` com `access` só do `primo` e id de lead do `sharken` → `null`.
  - admin (`isAdmin: true`, os dois workspaces) em `mcpListBatches` sem `workspace` → batches dos dois, com `workspace` preenchido.
  - `mcpGetBatch` agrupa: lead em `revisar` em `columns.novo`, `completar` em `qualificado`, `crm` em `pronto`, `descartado` em `descartados`; colunas vazias vêm como `[]`.
  - `mcpListBatches` traz `columns` com a contagem certa.
  - `mcpListLeads({ column: 'qualificado' })` só traz `completar`; `has_instagram_media` true quando `instagram_media` não vazio.
  - `access` com `workspaces: []` → listas vazias e `null` nos gets, sem lançar.
  - `workspaceFilter(access, 'primo')` para membro só do `sharken` → `[]`.
  - `mcpGetChat(..., limit 2)` com 3 mensagens → as 2 mais recentes em ordem cronológica, incluindo `direction = 'nota'`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/db test mcp-read` → FAIL.
- [ ] **Step 3: Implementar.** Reusar `listLeads`/`listContactsOfLeads` só se aceitarem cliente sem `scopeDb`; senão consultar direto. Se o `fakeDb` não suportar algum filtro usado (`in`, `ilike` em `or`, `range`), estender `fake-db.ts` no mínimo necessário.
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @lps/db test && pnpm --filter @lps/db typecheck` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(db): consultas de leitura do MCP por workspaces acessíveis"`

---

### Task 4: Briefing com link de verdade para imagens do material

**Files:**
- Modify: `packages/domain/src/briefing.ts`, chamadas de `buildBriefing` no web (`grep -rn buildBriefing apps`)
- Test: `packages/domain/tests/briefing.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `buildBriefing(lead: Lead, assets: LeadAsset[], materialImage?: (path: string) => string | null): string`. Sem resolvedor, os caminhos do material saem da seção "Fotos" (só fotos do Maps). Com resolvedor, entram numa seção própria `## Imagens do material (links temporários, não usar na página)` com o link devolvido.

- [ ] **Step 1: Testes que falham:**
  - sem resolvedor, `extracted_images: ['lead/extraidas/a-0.jpg']` não aparece no texto e `lead.photos` continua em `## Fotos`;
  - com `(p) => 'https://signed/' + p`, aparece `## Imagens do material (links temporários, não usar na página)` e `- https://signed/lead/extraidas/a-0.jpg`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/domain test briefing` → FAIL.
- [ ] **Step 3: Implementar** e, no painel, passar um resolvedor com links assinados de `lead-assets` (3600 s) onde o briefing é montado.
- [ ] **Step 4: Rodar e ver passar.** `pnpm test --filter @lps/domain --filter @lps/web` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix(domain): briefing não mostra caminho interno das imagens do material"`

---

### Task 5: Imagens para o MCP

**Files:**
- Create: `apps/web/src/lib/mcp/images.ts`
- Modify: `apps/web/package.json` (`sharp`)
- Test: `apps/web/tests/mcp-images.test.ts`

**Interfaces:**
- Produces:

```ts
export type ImageSource = { url: string; origin: 'instagram_perfil' | 'instagram_post' | 'foto' | 'material'; caption?: string | null; post_url?: string | null; temporary: boolean };
export function leadImageSources(lead: Lead, assets: LeadAsset[], signed: Map<string, string>, origem: 'instagram' | 'fotos' | 'material' | 'todas', limit: number): ImageSource[];
export function imageBlocks(sources: ImageSource[], fetcher?: typeof fetch): Promise<McpContent[]>; // McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
```

Ordem em `todas`: perfil do Instagram, posts, fotos do Maps, material. Cada imagem gera um bloco de texto antes (origem, link, legenda, e para `temporary` o aviso "link temporário, não usar na página") e o bloco `image`. Acima de ~1 MB, `sharp` redimensiona para no máximo 1600 px no maior lado, JPEG. Timeout de 10 s por imagem; falha vira só o bloco de texto com "não consegui baixar". `limit` limitado a 1..20.

- [ ] **Step 1: Testes que falham** (fetcher falso):
  - `leadImageSources` com `origem: 'instagram'` só traz `instagram_media`, perfil primeiro;
  - `limit: 30` vira 20;
  - lead sem nada → `[]`, e `imageBlocks([])` devolve um bloco de texto "Este lead não tem imagens."
  - fetcher que dá 404 na 2ª de 3 → 3 textos e 2 imagens, o 2º texto contém "não consegui baixar";
  - material vem com `temporary: true` e o texto tem "não usar na página".
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/web test mcp-images` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): imagens do lead para o MCP"`

---

### Task 6: Ferramentas e rota MCP com auth

**Files:**
- Create: `apps/web/src/lib/mcp/access.ts`, `apps/web/src/lib/mcp/tools.ts`, `apps/web/src/app/api/mcp/route.ts`, `apps/web/src/app/.well-known/oauth-protected-resource/route.ts`
- Modify: `apps/web/package.json` (`@modelcontextprotocol/sdk`, `mcp-handler`)
- Test: `apps/web/tests/api/mcp.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 5; `isPlatformAdmin`, `listUserWorkspaces`, `createAdminClient` de `@lps/db`.
- Produces:
  - `resolveAccess(token: string): Promise<Access | null>`: `createAdminClient().auth.getUser(token)`; inválido → `null`. Monta `Access` com `isPlatformAdmin` + `listUserWorkspaces`.
  - `registerTools(server: McpServer, ctx: { db: Db; access: Access }): void` com as 8 ferramentas do spec (`listar_workspaces`, `listar_batches`, `ver_batch`, `listar_leads`, `ver_lead`, `ver_imagens_do_lead`, `listar_atendimentos`, `ver_atendimento`), entradas com `zod` exatamente como a tabela do spec, todas com `annotations: { readOnlyHint: true }`. Saída em texto (JSON indentado ou Markdown, escolha do construtor); `ver_lead` inclui o briefing de `buildBriefing` com resolvedor de links assinados. Texto de terceiros dentro de `<conteudo_externo>…</conteudo_externo>`. Get que volta `null` → resposta com `isError: true` e texto "Não encontrado." Em `ver_atendimento`, mensagem com `media_path` sai com link assinado do `whatsapp-media` (3600 s), sem embutir o arquivo.
  - Rota: `createMcpHandler` + `withMcpAuth(handler, verifyToken, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource' })`; exporta `GET`, `POST`, `DELETE`. `verifyToken` devolve `{ token, clientId, scopes: [], extra: { access } }` ou `undefined`.
  - `/.well-known/oauth-protected-resource`: `protectedResourceHandler({ authServerUrls: [\`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1\`] })` + `OPTIONS` com CORS (`metadataCorsOptionsRequestHandler`).
  - Conferir com o context7 as assinaturas atuais do `mcp-handler`; se `withMcpAuth` não existir na versão instalada, implementar o 401 à mão com `WWW-Authenticate: Bearer resource_metadata="https://admin.sharkenapps.com/.well-known/oauth-protected-resource"`.

- [ ] **Step 1: Testes que falham** (mock de `resolveAccess` e das consultas):
  - `POST /api/mcp` sem `Authorization` → 401 e cabeçalho `WWW-Authenticate` contendo `resource_metadata=`;
  - token que `resolveAccess` recusa → 401;
  - `tools/list` com token bom → os 8 nomes, todos com `readOnlyHint: true`;
  - `tools/call ver_lead` com id fora do acesso → `isError: true`, texto "Não encontrado.";
  - `GET /.well-known/oauth-protected-resource` → JSON com `authorization_servers` contendo `/auth/v1`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/web test api/mcp` → FAIL.
- [ ] **Step 3: Implementar.** `db` de cada requisição = `readOnlyDb(createAdminClient())`. Conferir que `apps/web/src/proxy.ts` não intercepta `/api/mcp` nem `/.well-known` (só `/painel`).
- [ ] **Step 4: Rodar e ver passar.** `pnpm --filter @lps/web test && pnpm --filter @lps/web typecheck` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): endpoint MCP somente leitura com OAuth"`

---

### Task 7: Tela de consentimento e login que volta para ela

**Files:**
- Create: `apps/web/src/app/oauth/consent/page.tsx`, `apps/web/src/app/oauth/consent/actions.ts`
- Modify: `apps/web/src/app/login/actions.ts`, `apps/web/src/app/login/page.tsx`
- Test: `apps/web/tests/login.test.ts`, `apps/web/tests/oauth-consent.test.ts`

**Interfaces:**
- Produces: `safeNext(value: unknown): string` em `login/actions.ts` (devolve o caminho se começar com `/` e não com `//`; senão `/painel`). `signIn` lê `next` do form e redireciona para `safeNext(next)`. Página de login põe `next` num campo oculto a partir de `searchParams.next`.
- Consent: página server-side; sem `authorization_id` → mensagem de erro; sem usuário → `redirect('/login?next=' + encodeURIComponent('/oauth/consent?authorization_id=' + id))`; `getAuthorizationDetails` com `redirect_url` → `redirect` direto. Mostra `client.name` e o texto "Vai poder ler batches, leads e conversas dos seus workspaces, sem alterar nada." Botões Autorizar/Recusar chamam server actions `approve(id)`/`deny(id)` que fazem `redirect(data.redirect_url)`. Visual igual ao `/login` (mesmos componentes).

- [ ] **Step 1: Testes que falham:**
  - `safeNext('/oauth/consent?authorization_id=x')` → igual; `safeNext('//evil.com')` → `/painel`; `safeNext('https://evil.com')` → `/painel`; `safeNext(null)` → `/painel`;
  - consent sem usuário lança `REDIRECT /login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dabc`;
  - consent com `getAuthorizationDetails` devolvendo `{ redirect_url: 'https://claude.ai/cb?code=1' }` lança `REDIRECT https://claude.ai/cb?code=1`.
- [ ] **Step 2: Rodar e ver falhar.** `pnpm --filter @lps/web test login oauth-consent` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.** → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): tela de consentimento OAuth e login com retorno"`

---

### Task 8: Ligar o OAuth no Supabase, publicar e testar de ponta a ponta

**Files:**
- Modify: `docs/ambientes.md` (seção "MCP"), `CLAUDE.md` (linha em Decisões)

- [ ] **Step 1: Migração.** `pnpm db:migrate` → aplica a 0020 sem erro.
- [ ] **Step 2: Publicar o código.** `git push` na `main`; esperar o deploy da Vercel; `curl -s https://admin.sharkenapps.com/.well-known/oauth-protected-resource` → JSON; `curl -si -X POST https://admin.sharkenapps.com/api/mcp` → `401` com `WWW-Authenticate`.
- [ ] **Step 3: Preparar a mudança no Supabase.** No serviço Coolify `a5y2vbjkc8algctzx4erffyg` (API do Coolify, `COOLIFY_API_TOKEN`), acrescentar ao container de auth: `GOTRUE_OAUTH_SERVER_ENABLED=true`, `GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION=true`, `GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH=/oauth/consent` (conferir nomes na doc/código do GoTrue v2.186). Conferir que `GOTRUE_SITE_URL` é `https://admin.sharkenapps.com` (a URL de consentimento = Site URL + caminho) e que o Kong expõe `/.well-known/oauth-authorization-server/auth/v1`; se não, acrescentar a rota no `kong.yml` do serviço.
- [ ] **Step 4: Pedir confirmação ao Gabriel** para reiniciar o auth (e o Kong, se mudou). Só então reiniciar pelo Coolify.
- [ ] **Step 5: Verificar a descoberta.** `curl -s https://supa-sharken.sharkenapps.com/.well-known/oauth-authorization-server/auth/v1` → JSON com `authorization_endpoint`, `token_endpoint`, `registration_endpoint`. Login no painel continua funcionando.
- [ ] **Step 6: Ponta a ponta.** `claude mcp add --transport http sharken https://admin.sharkenapps.com/api/mcp`, autenticar pelo `/mcp`, aprovar na tela de consentimento; chamar `listar_workspaces`, `listar_batches`, `ver_batch`, `ver_lead` e `ver_imagens_do_lead` num lead Qualificado, `listar_atendimentos`, `ver_atendimento`. Com o token emitido, um `curl -X PATCH` em `/rest/v1/leads` deve falhar (bloqueio da 0020). Pedir ao Gabriel para conectar no claude.ai (Configurações › Conectores › URL).
- [ ] **Step 7: Documentar** em `docs/ambientes.md`: URL do MCP, como conectar no Claude Code, no claude.ai/app e no Cursor, variáveis ligadas no Supabase, como revogar (sessões do cliente OAuth no Supabase). Linha em Decisões do `CLAUDE.md`: "**MCP:** `/api/mcp`, somente leitura (batches, leads com imagens, atendimentos), OAuth 2.1 do Supabase com consentimento em `/oauth/consent`; token OAuth não grava (0020)."
- [ ] **Step 8: Commit e push.** `git commit -m "docs: MCP de leitura" && git push`
