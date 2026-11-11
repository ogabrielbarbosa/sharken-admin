# Ambientes: local e dev

## Os dois comandos

| Comando | O que faz |
|---|---|
| `pnpm local` | Sobe tudo na sua máquina: instala o que falta, abre o Docker, liga o banco local, aplica migrações, prepara o `.env.local`, cria o seu usuário na primeira vez e inicia o painel e o worker |
| `pnpm producao` | Publica na nuvem: confere o `.env.dev`, aplica as migrações no Supabase da nuvem, cria o usuário se faltar, envia as variáveis e faz o deploy na Vercel, e liga o worker usando o banco da nuvem |

Os dois podem ser rodados quantas vezes quiser: só fazem o que falta e nunca apagam dados. `pnpm local:check` faz a preparação sem iniciar o painel.

## Onde ficam as chaves

Na raiz do projeto, em dois arquivos que começam com ponto:

- `.env.local`: chaves do ambiente local. O `pnpm local` preenche o banco e os segredos; você preenche `ANTHROPIC_API_KEY` e `APIFY_TOKEN`.
- `.env.dev`: chaves da nuvem. Os segredos já estão gerados; você preenche Supabase, `APP_URL`, `ANTHROPIC_API_KEY` e `APIFY_TOKEN`.

Arquivos com ponto no começo ficam ocultos no Finder. Para vê-los, aperte `Cmd + Shift + .` na pasta do projeto, ou abra a pasta no VS Code. Eles não vão para o git.

São só dois ambientes:

| Ambiente | Banco | Arquivo de chaves | Para quê |
|---|---|---|---|
| **local** | Supabase no Docker, na sua máquina | `.env.local` | Desenvolver e testar |
| **dev** | Supabase na nuvem | `.env.dev` (e o painel da Vercel) | Teste online e staging |

Os dois arquivos ficam na raiz do projeto e não vão para o git. O app e o worker leem o mesmo arquivo, escolhido pela variável `APP_ENV` (`local` por padrão).

## Passo a passo manual (o que o pnpm local faz)

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

## Variáveis da v2

Todas ficam no `.env.local` e no `.env.dev`. As da Evolution são opcionais: só são cobradas quando você usa a função.

| Variável | Para quê | Padrão |
|---|---|---|
| `EVOLUTION_URL` | Endereço da Evolution API (sem barra no fim) | |
| `EVOLUTION_API_KEY` | Chave da Evolution | |
| `EVOLUTION_INSTANCE` | Nome da instância do número de prospecção | |
| `WHATSAPP_WEBHOOK_SECRET` | Segredo do webhook do WhatsApp (`openssl rand -hex 32`) | |
| `DAILY_FIRST_CONTACT_LIMIT` | Aviso de primeiros contatos por dia | 20 |

## WhatsApp (Evolution API)

1. Preencha `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` e `WHATSAPP_WEBHOOK_SECRET`.
2. Rode `pnpm whatsapp:webhook` (no dev, `pnpm whatsapp:webhook:remoto`). Ele registra na instância o webhook `/api/webhooks/whatsapp` com os eventos de mensagem e de conexão. Rode de novo se a URL do app mudar.
3. No painel, abra o CRM e conecte o número pelo QR Code.

Para baixar fotos, áudios, vídeos e documentos recebidos, o worker baixa a mídia da Evolution, e isso exige que ela guarde as mensagens (`DATABASE_SAVE_DATA_NEW_MESSAGE=true` no servidor dela). O `pnpm whatsapp:webhook` registra o webhook sem base64, porque a Vercel limita o corpo a 4,5 MB; se a mídia não baixar, confira essa opção e se o worker está rodando.

No local, o webhook precisa do túnel descrito abaixo, porque a Evolution não alcança `localhost`.

## Limite de tamanho de arquivo no Supabase

Os vídeos enviados por lead e as mídias do WhatsApp passam pelo Storage. No local o limite é 500 MiB (`file_size_limit` em `supabase/config.toml`); depois de mudar esse valor, aplique com `pnpm db:stop && pnpm db:start` (os dados são mantidos). Na nuvem, o limite é o do plano do Supabase (50 MB no gratuito) e pode ser aumentado em Storage > Settings.

## WhatsApp no local (Evolution API)

A Evolution v2.3.7 roda no Docker, com Postgres e Redis próprios, na porta 8085:

```bash
pnpm evolution:up     # sobe a Evolution (usa EVOLUTION_API_KEY do .env.local)
pnpm evolution:down   # para, mantendo a sessão do celular
```

No `.env.local`: `EVOLUTION_URL=http://localhost:8085`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WHATSAPP_WEBHOOK_SECRET` e `WHATSAPP_WEBHOOK_BASE_URL=http://host.docker.internal:<porta do painel>` (o container chama o painel por esse endereço). Depois, em **Conexões › WhatsApp**, clique em Conectar celular e leia o QR. O botão cria a instância e registra o webhook.

Conversas de exemplo: `pnpm crm:demo` cria 8 contatos com DDD 00 (o envio para eles é bloqueado) e `pnpm crm:demo --remover` apaga.

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

Apify, ZapSign, Asaas e a Evolution não conseguem chamar `localhost`. Para receber os retornos deles no local, abra um túnel e coloque a URL dele em `WEBHOOK_BASE_URL`:

```bash
cloudflared tunnel --url http://localhost:3010
```

Sem túnel, o worker busca o resultado do Apify sozinho a cada 20 segundos, então a busca funciona no local mesmo assim. O túnel só é necessário para receber os retornos do ZapSign e do Asaas.

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
| Evolution | `https://<dominio>/api/webhooks/whatsapp?token=<WHATSAPP_WEBHOOK_SECRET>`, registrado por `pnpm whatsapp:webhook:remoto` | segredo na URL |

O cron de retenção roda sozinho na Vercel, pelo `vercel.json`.
