# Apify por workspace

**Data:** 2026-11-17 · **Status:** aprovado pelo Gabriel

## Por quê

O Gabriel e os dois primos operam workspaces separados. Hoje todo uso do Apify (busca no Google Maps, Instagram
dos leads, fotos dos qualificados, leitura de link do Instagram) sai da conta do Gabriel pelo `APIFY_TOKEN` do
`.env`. Cada um passa a usar a própria conta (a gratuita, com US$ 5/mês, dá uns 7 batches de 50 lugares).

## Objetivos

- Cada workspace guarda o próprio token do Apify em Configurações; todo uso do Apify daquele workspace usa esse token.
- Nenhum token do Apify no projeto: `APIFY_TOKEN` sai do `.env`, da Vercel, do Coolify e do schema de env. Vale também
  para o workspace do Gabriel.
- Workspace sem token não roda nada do Apify e mostra o caminho para conectar.
- Crédito esgotado aparece com mensagem clara, não como erro genérico.

## Fora do escopo

- Claude (Anthropic) continua com a chave única do `.env` para todos.
- ZapSign continua como está.
- Cortar imagens e avaliações do Google Maps (assunto separado).
- Fallback para uma chave global: não existe, de propósito.

## Abordagens

1. **Tabela própria `workspace_apify`** (escolhida): mesmo molde da `workspace_billing` (só `service_role` lê). Simples e isolada.
2. Tabela genérica de credenciais (chave/valor por workspace): mais flexível, mas sem necessidade agora e com tipagem pior.
3. Coluna na `workspace_billing`: mistura cobrança com captura.

## Design

- **Migração** `0022_workspace_apify.sql`: `workspace_apify (workspace_id uuid pk → workspaces on delete cascade,
  token text not null, updated_at timestamptz)`, RLS ligado sem política, `grant all to service_role`.
- **`packages/db`**: `getWorkspaceApifyToken(db, workspaceId)`, `saveWorkspaceApify`, `deleteWorkspaceApify`
  (cliente sem escopo, como `billing.ts`).
- **`packages/integrations/src/apify.ts`**: as funções que falam com o Apify (`startActorRun`, `fetchDataset`,
  `getRun`, `runActorSync`) recebem o token como parâmetro; some a leitura de `process.env.APIFY_TOKEN`.
  Uma função `apifyAccount(token)` consulta `GET /v2/users/me` (usuário e plano) para validar ao salvar.
  Erro de falta de crédito do Apify (HTTP 402 ou mensagem de limite de uso) vira um erro com a mensagem
  "Acabou o crédito do Apify deste mês. Veja em console.apify.com › Billing."
- **Chamadores** (`capture.ts`: busca do Maps, retorno do Maps, Instagram, retorno do Instagram, sincronização de
  progresso; worker: `instagram-media.ts`, `extract-asset.ts`): buscam o token pelo workspace do batch/lead.
  Sem token: o batch vai para `erro` com "Conecte sua conta do Apify em Configurações › Apify"; os jobs de
  imagens e de extração terminam sem chamar o Apify e registram a mesma mensagem (sem novas tentativas).
- **Novo batch**: a action de criar batch recusa antes de criar, com a mesma mensagem, quando o workspace não tem token.
- **Configurações › Apify** (aba nova, permissão igual à da AbacatePay): campo do token, link para
  https://console.apify.com/settings/integrations, botão salvar que valida com `apifyAccount` e mostra
  "Conectado como <usuário> (plano <plano>)"; botão para remover. O token nunca volta para o navegador inteiro
  (só os últimos 4 caracteres).
- **Env**: remover `APIFY_TOKEN` de `packages/config/src/env.ts`, `.env.example`, testes, `docs/ambientes.md`
  e, depois do deploy e de o Gabriel colar o token no workspace dele, do `.env`, Vercel e Coolify (`pnpm env:sync`).
- **Docs**: atualizar o CLAUDE.md (a frase "ZapSign, Apify e Claude ainda usam as chaves do `.env`").

## Ordem de publicação

Migração → código → Gabriel cola o token atual em Configurações › Apify → remover `APIFY_TOKEN` dos ambientes.
Entre o deploy e o token salvo, batches do workspace do Gabriel ficam bloqueados (minutos).

## Fica para quem implementar

Nomes exatos, layout da aba seguindo as abas existentes, como detectar o erro de crédito pelo corpo da resposta do Apify.
