# Instância

Fonte: `src/api/routes/instance.router.ts`, `src/api/controllers/instance.controller.ts`, `src/validate/instance.schema.ts` (tag 2.3.7).

| Método | Rota | Chave | HTTP de sucesso |
|---|---|---|---|
| POST | `/instance/create` | global | 201 |
| GET | `/instance/connect/{instance}` | global ou token | 200 |
| GET | `/instance/connectionState/{instance}` | global ou token | 200 |
| GET | `/instance/fetchInstances` | global ou token | 200 |
| DELETE | `/instance/logout/{instance}` | global ou token | 200 |
| DELETE | `/instance/delete/{instance}` | global ou token | 200 |
| POST | `/instance/restart/{instance}` | global ou token | 200 |

Também existe `POST /instance/setPresence/{instance}` com `{ "presence": "available" | "unavailable" | "composing" | "recording" | "paused" }`.

## POST /instance/create

```json
{
  "instanceName": "sharken",
  "integration": "WHATSAPP-BAILEYS",
  "qrcode": true,
  "token": "opcional-token-da-instancia",
  "number": "5511999999999",
  "rejectCall": false,
  "msgCall": "",
  "groupsIgnore": true,
  "alwaysOnline": false,
  "readMessages": false,
  "readStatus": false,
  "syncFullHistory": false,
  "webhook": {
    "url": "http://host.docker.internal:3000/api/whatsapp/webhook",
    "byEvents": false,
    "base64": false,
    "headers": { "authorization": "Bearer segredo" },
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
  }
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `instanceName` | sim | Único. Nome repetido: `403` `This name "x" is already in use.` |
| `integration` | **na prática, sim** | `WHATSAPP-BAILEYS`, `WHATSAPP-BUSINESS` ou `EVOLUTION`. Sem ele: `400 Invalid integration`. O schema declara `Integration` com I maiúsculo, então o valor não é validado pelo schema, só pelo controller. |
| `qrcode` | não | Com `true` e Baileys, já inicia a conexão e espera 5 s para devolver o QR. |
| `token` | não | Se omitido, gera um UUID maiúsculo (o `hash` da resposta). |
| `number` | não | Com `qrcode: true`, pede pairing code para esse número. |
| `webhook` | não | Objeto aninhado. Quando presente, o webhook é salvo com `enabled: true` forçado. **Mande `events`** (pode ser `[]`, que vira "todos"). Sem `events`, o código quebra em `events.length` e a criação falha com 400 (e a instância é descartada). |
| `webhookUrl`, `webhookByEvents`, `webhookBase64`, `webhookEvents` | não | Campos planos herdados da v1. Aparecem no schema, mas o controller **ignora**. Use `webhook.{...}`. |
| `proxyHost`, `proxyPort`, `proxyProtocol`, `proxyUsername`, `proxyPassword` | não | Proxy é testado na criação. Proxy inválido: 400. |
| `chatwoot*` | não | Integração Chatwoot. Fora do escopo. |

Resposta (201):

```json
{
  "instance": {
    "instanceName": "sharken",
    "instanceId": "8a1f...uuid",
    "integration": "WHATSAPP-BAILEYS",
    "webhookWaBusiness": null,
    "accessTokenWaBusiness": "",
    "status": "connecting"
  },
  "hash": "B1C2D3E4-....",
  "webhook": {
    "webhookUrl": "http://host.docker.internal:3000/api/whatsapp/webhook",
    "webhookHeaders": { "authorization": "Bearer segredo" },
    "webhookByEvents": false,
    "webhookBase64": false
  },
  "websocket": {}, "rabbitmq": {}, "nats": {}, "sqs": {},
  "settings": {
    "rejectCall": false, "msgCall": "", "groupsIgnore": true, "alwaysOnline": false,
    "readMessages": false, "readStatus": false, "syncFullHistory": false, "wavoipToken": ""
  },
  "qrcode": {
    "pairingCode": null,
    "code": "2@AbCd...",
    "base64": "data:image/png;base64,iVBORw0KGgo...",
    "count": 1
  }
}
```

- `hash` é o token da instância. Guarde.
- `qrcode` só vem com `qrcode: true` e Baileys. `qrcode.base64` já inclui o prefixo `data:image/png;base64,`, pronto para `<img src>`.
- `instance.status` é o estado no momento da resposta (`close` ou `connecting`). Valor exato com `qrcode: true` não confirmado em teste.

## GET /instance/connect/{instance}

Inicia a conexão e devolve o QR. Query opcional `?number=5511999999999` para receber também o pairing code (código de 8 caracteres digitado no celular).

O comportamento depende do estado atual:

| Estado | Resposta |
|---|---|
| `close` | Inicia o socket, espera 2 s e devolve o QR (abaixo) |
| `connecting` | Devolve o QR atual (o `number` é ignorado) |
| `open` | Devolve o mesmo formato de `connectionState` |

```json
{
  "pairingCode": "WZYEH1YY",
  "code": "2@y8eK+bjtEjUWy9/FOM...",
  "base64": "data:image/png;base64,iVBORw0KGgo...",
  "count": 1
}
```

- `count` é quantos QRs já foram gerados. Ao chegar em `QRCODE_LIMIT` (padrão 30), a sessão é encerrada com estado `refused`.
- `pairingCode` é `null` quando não foi pedido `number`.
- Logo depois de iniciar, `base64` pode vir vazio. O QR também chega pelo evento `qrcode.updated`.
- Em erro, o controller responde `200` com `{ "error": true, "message": "..." }`, e não com status de erro.

## GET /instance/connectionState/{instance}

```json
{ "instance": { "instanceName": "sharken", "state": "open" } }
```

`state`: `open`, `connecting` ou `close` (e `refused` após estourar o limite de QR). Lê o estado em memória.

## GET /instance/fetchInstances

Query opcional: `instanceName`, `instanceId` ou `number`. Com a chave global lista todas. Com token de instância, só a(s) daquele token.

Resposta: **array** com as linhas da tabela `Instance` do Prisma e suas relações.

```json
[
  {
    "id": "8a1f...uuid",
    "name": "sharken",
    "connectionStatus": "open",
    "ownerJid": "5511999999999@s.whatsapp.net",
    "profileName": "Gabriel",
    "profilePicUrl": "https://pps.whatsapp.net/...",
    "integration": "WHATSAPP-BAILEYS",
    "number": null,
    "businessId": null,
    "token": "B1C2D3E4-....",
    "clientName": "evolution",
    "disconnectionReasonCode": null,
    "disconnectionObject": null,
    "disconnectionAt": null,
    "createdAt": "2026-11-10T12:00:00.000Z",
    "updatedAt": "2026-11-10T12:05:00.000Z",
    "Chatwoot": null, "Proxy": null, "Rabbitmq": null, "Nats": null, "Sqs": null, "Websocket": null,
    "Setting": { "rejectCall": false, "groupsIgnore": true, "...": "..." },
    "_count": { "Message": 120, "Contact": 45, "Chat": 30 }
  }
]
```

- O nome da instância está em `name`, não em `instanceName`.
- `connectionStatus` vem do banco: `open`, `close` ou `connecting`. Para o estado em tempo real, use `connectionState`.
- `number` é o número informado no create (pode ser `null`). O número conectado está em `ownerJid`.
- A resposta inclui `token`. Não exponha no front.
- `Webhook` **não** vem incluído. Use `GET /webhook/find/{instance}`.
- Nome inexistente em `instanceName`: `404 Instance "x" not found`.

## DELETE /instance/logout/{instance}

Desconecta o WhatsApp e apaga as credenciais. A instância continua existindo e pode gerar novo QR.

```json
{ "status": "SUCCESS", "error": false, "response": { "message": "Instance logged out" } }
```

Se o estado já é `close`: `400 The "x" instance is not connected`.

## DELETE /instance/delete/{instance}

Faz logout (se `open` ou `connecting`), dispara `instance.delete` e remove a instância.

```json
{ "status": "SUCCESS", "error": false, "response": { "message": "Instance deleted" } }
```

## POST /instance/restart/{instance}

Sem body. Fecha o socket e reconecta.

- Estado `close`: devolve `200` com `{ "error": true, "message": "...is not connected" }` (o erro é capturado e não vira 4xx).
- Estado `open` ou `connecting`: devolve o mesmo que `GET /instance/connect` (para `open`, o formato de `connectionState`; para `connecting`, o QR).

## Exemplo rápido (curl)

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"sharken","integration":"WHATSAPP-BAILEYS","qrcode":true}'

curl http://localhost:8080/instance/connectionState/sharken -H "apikey: $EVOLUTION_API_KEY"
```
