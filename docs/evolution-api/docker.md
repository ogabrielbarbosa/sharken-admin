# Docker (rodar local)

Fonte: `src/config/env.config.ts`, `.env.example`, `Dockerfile`, `Docker/scripts/deploy_database.sh`, `src/api/routes/index.router.ts` (tag 2.3.7).

Imagem: `evoapicloud/evolution-api:v2.3.7`. Porta interna `8080`. Na subida, o entrypoint roda `prisma migrate deploy` no banco de `DATABASE_CONNECTION_URI`. Se o banco não estiver acessível, o container sai com `Migration failed`.

## Variáveis essenciais

| Variável | Exemplo | Padrão no código | Observação |
|---|---|---|---|
| `SERVER_URL` | `http://localhost:8080` | vazio | Vai no campo `server_url` dos webhooks |
| `SERVER_PORT` | `8080` | `8080` | |
| `AUTHENTICATION_API_KEY` | chave longa aleatória | `BQYHJGJHJ` | Chave global. **Troque.** |
| `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES` | `true` | `false` | Também controla se o token da instância vai no campo `apikey` do webhook |
| `DATABASE_PROVIDER` | `postgresql` | `postgresql` | Também aceita `mysql` e `psql_bouncer` |
| `DATABASE_CONNECTION_URI` | `postgresql://evolution:senha@postgres:5432/evolution?schema=evolution_api` | vazio | |
| `DATABASE_CONNECTION_CLIENT_NAME` | `evolution` | `evolution` | Separa instâncias de vários servidores no mesmo banco. `fetchInstances` filtra por ele. |
| `DATABASE_SAVE_DATA_INSTANCE` | `true` | `false` | Persiste a sessão no Postgres. Sem isso (e sem Redis com `SAVE_INSTANCES`), a sessão se perde no restart. |
| `DATABASE_SAVE_DATA_NEW_MESSAGE` | `true` | `false` | Necessário para `findMessages`, `findChats`, `quoted` só com `key` e `getBase64FromMediaMessage` só com `key` |
| `DATABASE_SAVE_MESSAGE_UPDATE` | `true` | `false` | Histórico de status |
| `DATABASE_SAVE_DATA_CONTACTS` | `true` | `false` | Necessário para `findContacts` |
| `DATABASE_SAVE_DATA_CHATS` | `true` | `false` | Necessário para `findChats` (nome, não lidas) |
| `DATABASE_SAVE_DATA_HISTORIC` | `false` | `false` | Grava o histórico sincronizado na conexão |
| `CACHE_REDIS_ENABLED` | `true` | `false` | |
| `CACHE_REDIS_URI` | `redis://redis:6379/6` | vazio | |
| `CACHE_REDIS_PREFIX_KEY` | `evolution` | `evolution-cache` | |
| `CACHE_REDIS_TTL` | `604800` | `604800` | Segundos |
| `CACHE_REDIS_SAVE_INSTANCES` | `false` | `false` | `true` guarda a sessão no Redis em vez do Postgres |
| `CACHE_LOCAL_ENABLED` | `false` | `false` | Cache em memória, alternativa ao Redis |
| `LOG_LEVEL` | `ERROR,WARN,INFO,LOG,WEBHOOKS` | todos (`ERROR,WARN,DEBUG,INFO,LOG,VERBOSE,DARK,WEBHOOKS,WEBSOCKET`) | `WEBHOOKS` loga cada envio de webhook |
| `LOG_BAILEYS` | `error` | `error` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `DEL_INSTANCE` | `false` | `false` | Número = minutos até apagar instância que não conectou. `false` = nunca. |
| `QRCODE_LIMIT` | `30` | `30` | QRs gerados antes de desistir (estado `refused`) |
| `CONFIG_SESSION_PHONE_CLIENT` | `Sharken` | `Evolution API` | Nome que aparece em "Aparelhos conectados" |
| `CONFIG_SESSION_PHONE_NAME` | `Chrome` | `Chrome` | Navegador simulado |
| `LANGUAGE` | `pt-BR` | `en` | |
| `TELEMETRY_ENABLED` | `false` | `true` (ligado se a variável não existir) | Envia telemetria de uso para o projeto |

### CONFIG_SESSION_PHONE_VERSION

**Não existe na 2.3.7.** O código não lê essa variável. A versão do WhatsApp Web é buscada a cada conexão em `https://web.whatsapp.com/sw.js` (`client_revision`), com fallback para `fetchLatestBaileysVersion()`. O resultado aparece em `GET /` como `whatsappWebVersion`. Se o container não tiver acesso à internet, usa a versão do Baileys.

## docker-compose mínimo

O Postgres e o Redis ficam só na rede interna do compose, sem porta publicada no host, para não conflitar com o Supabase local.

```yaml
services:
  evolution:
    image: evoapicloud/evolution-api:v2.3.7
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      SERVER_URL: http://localhost:8080
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:evolution@postgres:5432/evolution?schema=evolution_api
      DATABASE_CONNECTION_CLIENT_NAME: evolution
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "true"
      DATABASE_SAVE_DATA_CHATS: "true"
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://redis:6379/6
      CACHE_REDIS_PREFIX_KEY: evolution
      CACHE_REDIS_SAVE_INSTANCES: "false"
      CACHE_LOCAL_ENABLED: "false"
      LOG_LEVEL: ERROR,WARN,INFO,LOG,WEBHOOKS
      LOG_BAILEYS: error
      DEL_INSTANCE: "false"
      CONFIG_SESSION_PHONE_CLIENT: Sharken
      LANGUAGE: pt-BR
      TELEMETRY_ENABLED: "false"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evolution
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data

  redis:
    image: redis:7
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - evolution_redis:/data

volumes:
  evolution_instances:
  evolution_pg:
  evolution_redis:
```

## Container chamando o app no host

O webhook sai **de dentro do container**. `localhost` ali é o próprio container. Para chegar no Next.js rodando no Mac:

```
http://host.docker.internal:3000/api/whatsapp/webhook
```

- Docker Desktop (Mac/Windows): `host.docker.internal` já resolve.
- Linux: precisa de `extra_hosts: ["host.docker.internal:host-gateway"]` (já está no compose acima, e no Mac não atrapalha).
- O servidor do app precisa aceitar conexões na interface que o Docker usa. `next dev` escuta em todas as interfaces por padrão. Se usar `-H 127.0.0.1`, o container não alcança.
- A URL precisa começar com `http://` ou `https://`, senão o webhook é ignorado em silêncio.
- No sentido contrário (app → Evolution), use `http://localhost:8080`.

## GET /

Sem autenticação. Bom para health check.

```json
{
  "status": 200,
  "message": "Welcome to the Evolution API, it is working!",
  "version": "2.3.7",
  "clientName": "evolution",
  "manager": "http://localhost:8080/manager",
  "documentation": "https://doc.evolution-api.com",
  "whatsappWebVersion": "2.3000.<client_revision>"
}
```

- `manager` some com `SERVER_DISABLE_MANAGER=true`. O painel web fica em `/manager`.
- `whatsappWebVersion` faz uma requisição externa a cada chamada. Para health check frequente, prefira checar só o status HTTP.

## Comandos úteis

```bash
docker compose up -d
curl -s http://localhost:8080/ | jq .version
docker compose logs -f evolution
```

Para apagar os dados do Evolution, remova os volumes do compose acima. Isso não toca no Supabase.
