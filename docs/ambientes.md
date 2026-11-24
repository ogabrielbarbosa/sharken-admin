# Ambiente

Existe **um ambiente só**. O painel no seu Mac (`pnpm dev`), o painel publicado (https://admin.sharkenapps.com) e o worker da VPS usam o **mesmo banco**, o Supabase da VPS. Tudo o que você faz no local é real: grava na produção, manda WhatsApp de verdade e gasta Apify (na conta do workspace) e Claude de verdade.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Painel em http://localhost:3010, usando o banco da produção |
| `pnpm db:new nome` | Cria uma migração em `supabase/migrations/` |
| `pnpm db:migrate` | Aplica as migrações novas no banco da VPS (por túnel SSH; nunca apaga dados) |
| `pnpm env:sync` | Envia o `.env` para a Vercel e para o worker no Coolify, e reinicia o worker |
| `pnpm worker` | Worker no seu Mac. Só quando estiver mexendo no código dele (veja abaixo) |
| `pnpm user:create email senha [workspace]` | Cria um usuário do painel e o põe no workspace (slug; padrão `sharken`). Também dá para fazer em Workspaces, no painel |
| `pnpm test` / `pnpm typecheck` | Testes e tipos |

Publicar é dar `git push` na `main`: a Vercel publica o painel e o Coolify reconstrói o worker (quando o push mexe em `apps/worker`, `packages`, `pnpm-lock.yaml` ou `package.json`).

## Onde roda cada parte

| Parte | Onde |
|---|---|
| Painel, API, webhooks e cron (`apps/web`) | Vercel, projeto `sharken-admin`, em https://admin.sharkenapps.com |
| Worker (`apps/worker`) | VPS, app `sharken-worker` no Coolify (imagem `apps/worker/Dockerfile`) |
| Banco, auth e storage | VPS, serviço `supa-sharken` no Coolify, em https://supa-sharken.sharkenapps.com |
| WhatsApp | Evolution API na VPS, em https://evo.sharkenapps.com |

O worker não roda na Vercel porque fica ligado o tempo todo e usa o Chromium.

O Studio do Supabase fica em https://supa-sharken.sharkenapps.com. O usuário e a senha ficam no Coolify, no serviço supa-sharken: `SERVICE_USER_ADMIN` e `SERVICE_PASSWORD_ADMIN`.

## O arquivo .env

Fica na raiz do projeto e não vai para o git (arquivos com ponto no começo ficam ocultos no Finder: `Cmd + Shift + .`). O modelo é o `.env.example`.

- `APP_URL` é `http://localhost:3010` no Mac. O `env:sync` troca por `PUBLIC_URL` na Vercel e no worker.
- `WEBHOOK_BASE_URL` aponta para a produção. Apify e Evolution não alcançam o seu Mac, então os retornos deles sempre chegam pelo painel publicado, que grava no mesmo banco. Por isso a busca e as mensagens recebidas aparecem no `pnpm dev` sem túnel.
- As chaves do fim do arquivo (`SUPABASE_DB_*`, `COOLIFY_*`) são só do Mac: o `env:sync` não as envia.

Mudou uma chave? Rode `pnpm env:sync`. O worker reinicia na hora; o painel publicado só pega a mudança no próximo deploy (`git push`).

## Worker no Mac

A fila `jobs` é única. O worker da VPS atende tudo, inclusive o que você dispara pelo `pnpm dev`. Só rode `pnpm worker` quando estiver mexendo no código dele: enquanto ele estiver ligado, ele e o da VPS dividem as tarefas (cada uma vai para um só), então uma parte roda com o seu código novo e outra com o publicado.

## Mudanças no banco

1. `pnpm db:new nome-da-mudanca` cria um arquivo em `supabase/migrations/`.
2. Escreva o SQL e rode `pnpm db:migrate`. Ele aplica direto na produção.
3. Publique o código que usa a mudança (`git push`).

Como não há banco de teste, prefira mudanças que não quebram o código publicado: acrescentar coluna ou tabela antes de usar, e só remover depois que nada usa mais. Nunca edite uma migração já aplicada: crie uma nova.

## Backup

Um `pg_dumpall` roda todo dia às 3h na VPS e guarda 14 dias em `/root/backups/supa-sharken/` (script `/root/backups/supa-sharken.sh`). Cobre só o banco; os arquivos do Storage ficam no volume do MinIO do serviço.

Para restaurar, fale com o Claude ou rode na VPS: `gunzip -c <arquivo>.sql.gz | docker exec -i supabase-db-a5y2vbjkc8algctzx4erffyg psql -U supabase_admin -d postgres`.

## WhatsApp (Evolution API)

1. `EVOLUTION_URL`, `EVOLUTION_API_KEY` e `WHATSAPP_WEBHOOK_SECRET` ficam no `.env`.
2. Em **Configurações › WhatsApp**, clique em **Nova instância** e dê um nome (ou escolha uma que já existe no servidor). O painel cria a instância, registra o webhook `/api/webhooks/whatsapp` da produção e passa a usá-la no CRM; a instância em uso fica salva no banco (`whatsapp_connection.instance`).
3. Leia o QR (ou use o código pelo número).

Toda vez que a tela abre, o painel confere o webhook e corrige se ele mudou. Eventos de uma instância que não é a em uso são ignorados.

**Importar últimos 2 dias** (em Configurações › WhatsApp, com o celular conectado) pede ao worker para trazer as conversas individuais dos últimos 2 dias guardadas na Evolution (`DATABASE_SAVE_DATA_HISTORIC=true`). Tudo entra fechado e sem não lidas; o que já está no CRM é pulado. Conversas que o WhatsApp manda só com o LID (sem o número) ficam de fora até a pessoa mandar uma mensagem nova.

Para baixar fotos, áudios, vídeos e documentos recebidos, o worker baixa a mídia da Evolution, e isso exige `DATABASE_SAVE_DATA_NEW_MESSAGE=true` no servidor dela. O webhook é registrado sem base64, porque a Vercel limita o corpo a 4,5 MB.

Conversas de exemplo: `pnpm crm:demo` cria 8 contatos com DDD 00 (o envio para eles é bloqueado) e `pnpm crm:demo --remover` apaga. Lembre que elas entram no banco da produção.

## Limite de arquivo no Storage

500 MB por arquivo (`UPLOAD_FILE_SIZE_LIMIT` do serviço supa-sharken no Coolify).

## Apify (conta de cada workspace)

**Configurações › Custos** (só o dono) mostra o gasto do ciclo, por dia, ator e batch. O valor vem do Apify; `apify_runs` guarda
quais execuções são do Sharken. Toda execução nova deve chamar `recordApifyRun`, senão aparece como de outro projeto.

Não existe token do Apify no `.env`. Cada workspace cola o próprio em **Configurações › Apify** (tabela `workspace_apify`,
só o servidor lê); o sistema confere no Apify de quem é a conta antes de salvar. A busca do batch, o Instagram dos leads,
as imagens dos qualificados e a leitura de link do Instagram usam o token do workspace. Sem token, o Novo batch avisa
para conectar; com o crédito do mês esgotado, o batch mostra "Acabou o crédito do Apify deste mês". A conta gratuita
traz US$ 5 por mês (uns 7 batches de 50 lugares).

## Imagens do Instagram (Cloudflare R2)

Quando um lead vira Qualificado, `moveLead` coloca na fila o job `instagram_media`. O worker busca o perfil no
Apify de novo (os links de imagem do Instagram expiram em poucos dias), baixa a foto de perfil em HD e as imagens
dos últimos 12 posts (carrossel inteiro, capa do vídeo) e salva no bucket R2 `sharken-media`, em
`leads/<lead>/instagram/`. Os links públicos ficam em `leads.instagram_media` e aparecem no Qualificado e no briefing.
Lead sem Instagram ou que já tem imagens é pulado. Sem as variáveis `R2_*`, o job espera e tenta de novo a cada hora.

## Webhooks dos serviços

Cadastre estas URLs nos painéis dos serviços, trocando `<segredo>` pelo `WEBHOOK_SECRET`:

| Serviço | URL | Autenticação |
|---|---|---|
| Apify | registrado automaticamente a cada busca | segredo na URL |
| ZapSign | `https://admin.sharkenapps.com/api/webhooks/zapsign?secret=<segredo>` | segredo na URL |
| AbacatePay | `https://admin.sharkenapps.com/api/webhooks/abacatepay/<workspace>`, um por workspace, registrado pelo painel ao salvar a chave em Configurações › Pagamentos | segredo próprio do workspace (`webhookSecret`) |
| Asaas (só cobranças antigas) | `https://admin.sharkenapps.com/api/webhooks/asaas` | campo "Token de autenticação" igual ao `<segredo>` |
| Evolution | `https://admin.sharkenapps.com/api/webhooks/whatsapp?token=<WHATSAPP_WEBHOOK_SECRET>`, registrado pelo painel | segredo na URL |

Os crons de retenção e de cobranças vencidas (`/api/cron/overdue`, 7h de Brasília) rodam sozinhos na Vercel, pelo `vercel.json`.

## MCP (leitura para o Claude e outras ferramentas)

Endpoint: `https://admin.sharkenapps.com/api/mcp` (Streamable HTTP, sem estado). Lê batches, leads por coluna,
tudo de um lead (com briefing e imagens) e atendimentos. Cada usuário vê os próprios workspaces; o administrador vê todos.
A única escrita é a página do lead (abaixo).

**Páginas publicadas (`publicar_pagina`, `preparar_upload_da_pagina`, `alterar_expiracao_da_pagina`, `listar_paginas`)**
- O agente manda o HTML completo de um lead; o servidor grava na tabela `pages` (id aleatório de 10 caracteres)
  e devolve `https://pages.sharkenapps.com/<id>`. O link vai para `leads.page_url`; lead em Página passa para Vídeo,
  como ao colar o link no quadro. Com `pagina_id`, troca o HTML e mantém o link.
- `expira_em_horas` (ex.: 24) conta a partir de agora; sem ele ou `null`, não expira. A expiração é conferida a cada
  visita (sem cron): vencida responde 410 "Esta página expirou". `alterar_expiracao_da_pagina` muda ou reabre.
- `pages.sharkenapps.com` é um domínio do mesmo projeto da Vercel (CNAME no Cloudflare, DNS only). O `proxy.ts`
  só deixa passar `/<id>` nesse host e reescreve para `/paginas-publicadas/<id>`, que só responde nele. O HTML sai
  com `Content-Security-Policy: sandbox` sem `allow-same-origin` (origem opaca, sem cookies/armazenamento),
  `noindex` e `no-store`. Limite de 2 milhões de caracteres: imagens por link (Instagram no R2), não em base64.
- O host vem de `PAGES_URL` (padrão `https://pages.sharkenapps.com`).
- **Upload de arquivo (`preparar_upload_da_pagina`)**: para página grande, o agente não cola o HTML na chamada (ele
  teria de redigitar tudo, e passa do limite de uma resposta). A ferramenta devolve um link assinado e o comando
  `curl -X PUT --data-binary @arquivo.html "<link>"`, que publica e responde `url`. O token (HMAC com a
  `SUPABASE_SERVICE_ROLE_KEY`, sem tabela) leva lead, workspace, usuário, id da página, título e expiração, e vale
  30 minutos. O id da página nova já vem reservado, então reenviar com o mesmo link troca o HTML da mesma página.
  Rota: `/api/pages/upload` (`apps/web/src/app/api/pages/upload/route.ts`).

**Como conectar**
- claude.ai e app do Claude: Configurações › Conectores › Adicionar conector personalizado › cole a URL. Ele abre o
  login do Sharken e a tela "Autorizar acesso".
- Claude Code: `claude mcp add --transport http sharken https://admin.sharkenapps.com/api/mcp` e depois `/mcp` para entrar.
- Cursor e outros: adicionar como servidor MCP remoto (HTTP) com a mesma URL; o OAuth é descoberto sozinho.

**Como funciona o login**
- O Supabase Auth do `supa-sharken` é o servidor OAuth 2.1 (variáveis no Coolify: `GOTRUE_OAUTH_SERVER_ENABLED=true`,
  `GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION=true`, `GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH=/oauth/consent`;
  `API_EXTERNAL_URL` tem de ser o endereço público `https://supa-sharken.sharkenapps.com/auth/v1`).
- O Kong deixa abertas (sem `apikey`) as rotas de descoberta (`/.well-known/oauth-authorization-server/auth/v1`) e
  `/auth/v1/oauth/*` (autorizar, token, registro de cliente). O resto de `/auth/v1/` continua exigindo `apikey`.
- `/.well-known/oauth-protected-resource` (no admin) aponta o Supabase como servidor de autorização; a URL pública
  vem de `APP_URL`.
- Escopos pedidos: só `email profile` (`scopes_supported` do recurso e `scope` no `WWW-Authenticate` do 401). Sem
  `openid` de propósito: com ele o Supabase tenta emitir um ID token, que exige chave assimétrica, e o nosso assina
  com HS256; a troca do código falha ("HS256 is not supported for ID token signing") e o Claude mostra "Não foi
  possível conectar". Se algum cliente insistir em `openid`, a saída é configurar uma chave ES256/RS256 no Auth
  (`GOTRUE_JWT_KEYS`), o que muda a assinatura de todos os tokens (PostgREST, Realtime e Storage precisam aceitar).
- O token emitido é uma sessão do usuário marcada com `client_id`; a migração 0020 recusa insert/update/delete de
  sessões com esse claim. Tabela nova com política para `authenticated` precisa da mesma restrição (o teste de
  migrações falha se faltar).

**Tela:** Configurações › MCP (Claude) mostra o endereço, o passo a passo e as conexões autorizadas do usuário.

**Revogar acesso:** botão Desconectar em Configurações › MCP (revoga o consentimento e derruba as sessões da ferramenta).
Por fora: apagar as sessões do cliente OAuth no Supabase (Studio › Authentication) ou trocar a senha do usuário.
