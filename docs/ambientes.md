# Ambientes: local e dev

São só dois ambientes:

| Ambiente | Banco | Arquivo de chaves | Para quê |
|---|---|---|---|
| **local** | Supabase no Docker, na sua máquina | `.env.local` | Desenvolver e testar |
| **dev** | Supabase na nuvem | `.env.dev` (e o painel da Vercel) | Teste online e staging |

Os dois arquivos ficam na raiz do projeto e não vão para o git. O app e o worker leem o mesmo arquivo, escolhido pela variável `APP_ENV` (`local` por padrão).

## Primeira vez no local

Precisa de Docker aberto e Node 22.

```bash
pnpm install
pnpm exec playwright install chromium   # navegador usado pelo worker
pnpm db:start                            # sobe o Supabase local e aplica as migrações
pnpm setup:local                         # cria o .env.local com as chaves do banco e os segredos
pnpm user:create voce@email.com sua-senha
```

Depois, abra o `.env.local` e preencha pelo menos `ANTHROPIC_API_KEY` e `APIFY_TOKEN`. As outras chaves só são necessárias quando você usar o serviço correspondente.

## Dia a dia no local

```bash
pnpm db:start   # se o Docker foi reiniciado
pnpm dev        # painel em http://localhost:3010 e worker juntos
```

| Endereço | O que é |
|---|---|
| http://localhost:3010 | Painel |
| http://127.0.0.1:57323 | Supabase Studio, para ver as tabelas |
| http://127.0.0.1:57324 | Caixa de e-mails do Supabase local |

O banco local usa as portas 57321 a 57324 para não conflitar com outros projetos Supabase da sua máquina.

## Como não perder os dados do banco local

Os dados ficam em um volume do Docker e **continuam lá** quando você para o banco, fecha o Docker ou reinicia a máquina.

| Comando | O que faz com os dados |
|---|---|
| `pnpm db:stop` | Para o banco e **mantém** os dados |
| `pnpm db:start` | Sobe de novo com os mesmos dados |
| `pnpm db:migrate` | Aplica migrações novas **sem apagar** nada |
| `pnpm db:backup` | Salva uma cópia dos dados em `backups/` |

**Nunca use estes comandos se quiser manter os dados:**

- `supabase db reset`: recria o banco do zero.
- `supabase stop --no-backup`: apaga o volume.
- `supabase stop --all`: para também os outros projetos Supabase da sua máquina.
- `docker volume prune` ou "Clean / Purge data" no Docker Desktop: apaga volumes.

Para restaurar um backup:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:57322/postgres" -f backups/<arquivo>.sql
```

## Mudanças no banco

1. `pnpm db:new nome-da-mudanca` cria um arquivo em `supabase/migrations/`.
2. Escreva o SQL e rode `pnpm db:migrate` para aplicar no local.
3. Quando estiver bom, aplique no dev (abaixo).

Nunca edite uma migração que já foi aplicada no dev: crie uma nova.

## Webhooks no local

Apify, ZapSign e Asaas não conseguem chamar `localhost`. Para receber os retornos deles no local, abra um túnel e coloque a URL dele em `WEBHOOK_BASE_URL`:

```bash
cloudflared tunnel --url http://localhost:3010
```

Sem túnel, a busca no Apify roda, mas o resultado não volta para o local.

## Levar para o dev

Uma vez:

1. Crie o projeto no Supabase e rode `pnpm db:link` (pede o ref do projeto e a senha do banco).
2. Copie `.env.dev.example` para `.env.dev` e preencha com as chaves do projeto na nuvem.
3. Na Vercel, importe o repositório com **Root Directory** `apps/web` e cadastre as mesmas variáveis do `.env.dev`.

A cada mudança no banco:

```bash
pnpm db:push:remoto    # aplica no dev só as migrações que faltam
```

Para criar o seu usuário no dev: `pnpm user:create:remoto voce@email.com sua-senha`.

O worker roda no seu Mac. Para ele trabalhar com o banco do dev, use `pnpm worker:remoto`. Para rodar o painel local apontando para o dev, use `pnpm dev:remoto`.

## Webhooks no dev

Cadastre estas URLs nos painéis dos serviços, trocando `<dominio>` pelo endereço do dev e `<segredo>` pelo `WEBHOOK_SECRET`:

| Serviço | URL | Autenticação |
|---|---|---|
| Apify | registrado automaticamente a cada busca | segredo na URL |
| ZapSign | `https://<dominio>/api/webhooks/zapsign?secret=<segredo>` | segredo na URL |
| Asaas | `https://<dominio>/api/webhooks/asaas` | campo "Token de autenticação" igual ao `<segredo>` |

O cron de retenção roda sozinho na Vercel, pelo `vercel.json`.
