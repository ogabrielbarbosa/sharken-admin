# Webhook

Fonte: `src/api/integrations/event/webhook/webhook.{router,schema,controller}.ts`, `src/api/integrations/event/event.controller.ts`, `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts` (tag 2.3.7).

## POST /webhook/set/{instance}

O body é **aninhado em `webhook`**. O schema exige `webhook`, e dentro dele `enabled` e `url`.

```json
{
  "webhook": {
    "enabled": true,
    "url": "http://host.docker.internal:3000/api/whatsapp/webhook",
    "headers": { "authorization": "Bearer segredo", "Content-Type": "application/json" },
    "byEvents": false,
    "base64": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"]
  }
}
```

| Campo | Tipo | Observação |
|---|---|---|
| `enabled` | boolean | Obrigatório. `false` zera `events`. |
| `url` | string | Obrigatório. Só dispara se começar com `http://` ou `https://`. |
| `headers` | objeto | Enviados em toda chamada. Se tiver `jwt_key`, o servidor troca por `Authorization: Bearer <JWT HS256>` assinado com essa chave (expira em 10 min). |
| `byEvents` | boolean | `true` acrescenta o evento na URL: `.../webhook/messages-upsert`. |
| `base64` | boolean | `true` inclui `message.base64` com a mídia em mensagens de mídia. |
| `events` | string[] | Nomes em MAIÚSCULAS com `_` (tabela abaixo). **Mande sempre**, mesmo vazio. `[]` com `enabled: true` vira "todos os eventos". Omitir com `enabled: true` quebra (`events.length` de `undefined`) e retorna erro. |

Resposta **201** com a linha salva (modelo `Webhook` do Prisma):

```json
{
  "id": "clx...",
  "url": "http://host.docker.internal:3000/api/whatsapp/webhook",
  "headers": { "authorization": "Bearer segredo" },
  "enabled": true,
  "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"],
  "webhookByEvents": false,
  "webhookBase64": false,
  "createdAt": "2026-11-10T12:00:00.000Z",
  "updatedAt": "2026-11-10T12:00:00.000Z",
  "instanceId": "8a1f...uuid"
}
```

**Diverge da documentação oficial:** a doc mostra o body plano (`enabled`, `url`, `events`... na raiz) e resposta `200 { "success": true, "message": "Webhook configured successfully" }`. No código da 2.3.7, body plano falha na validação (`requires property "webhook"`) e a resposta é a linha do banco com status 201.

## GET /webhook/find/{instance}

Devolve a mesma linha acima, ou `null` se não houver webhook configurado.

## Eventos

Aceitos em `events` (`EventController.events`):

```
APPLICATION_STARTUP  QRCODE_UPDATED  MESSAGES_SET  MESSAGES_UPSERT  MESSAGES_EDITED
MESSAGES_UPDATE  MESSAGES_DELETE  SEND_MESSAGE  SEND_MESSAGE_UPDATE  CONTACTS_SET
CONTACTS_UPSERT  CONTACTS_UPDATE  PRESENCE_UPDATE  CHATS_SET  CHATS_UPSERT  CHATS_UPDATE
CHATS_DELETE  GROUPS_UPSERT  GROUP_UPDATE  GROUP_PARTICIPANTS_UPDATE  CONNECTION_UPDATE
LABELS_EDIT  LABELS_ASSOCIATION  CALL  TYPEBOT_START  TYPEBOT_CHANGE_STATUS
REMOVE_INSTANCE  LOGOUT_INSTANCE  INSTANCE_CREATE  INSTANCE_DELETE  STATUS_INSTANCE
```

No payload, o campo `event` vem em minúsculas com ponto: `MESSAGES_UPSERT` → `messages.upsert`. Com `byEvents: true`, o sufixo da URL usa hífen: `/messages-upsert`.

Os mais úteis para um CRM:

| Evento (`event`) | Quando |
|---|---|
| `qrcode.updated` | Novo QR gerado durante a conexão |
| `connection.update` | Mudança de estado (`connecting`, `open`, `close`, `refused`) |
| `messages.upsert` | Mensagem recebida, ou enviada **pelo celular** (`fromMe: true`) |
| `send.message` | Mensagem enviada **pela API** (o socket usa `emitOwnEvents: false`, então envios da API não geram `messages.upsert`) |
| `messages.update` | Mudança de status (entregue, lida...) |
| `contacts.upsert` / `contacts.update` | Contato novo ou atualizado, com `profilePicUrl` |
| `chats.upsert` | Chat novo, ou mudança de nome/não lidas |

Detalhe: `GROUP_UPDATE` na lista não bate com o evento emitido (`groups.update` vira `GROUPS_UPDATE`), então assinar `GROUP_UPDATE` provavelmente não entrega atualizações de grupo. Não confirmado em teste.

## Envelope

Todo POST para o webhook tem este formato:

```json
{
  "event": "messages.upsert",
  "instance": "sharken",
  "data": { },
  "destination": "http://host.docker.internal:3000/api/whatsapp/webhook",
  "date_time": "2026-11-10T09:15:30.123Z",
  "sender": "5511999999999@s.whatsapp.net",
  "server_url": "http://localhost:8080",
  "apikey": "B1C2D3E4-...."
}
```

- `date_time` é a hora local do servidor formatada como ISO, com `Z` mesmo sem ser UTC.
- `sender` é o JID do número conectado.
- `apikey` é o token da instância, só se `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`. Senão, `null`.
- `messages.set` traz também `isLatest` e `progress` na raiz (novo na 2.3.7).

## messages.upsert

`data` é **um objeto** (uma mensagem por POST). Campos: `key`, `pushName`, `status`, `message`, `contextInfo`, `messageType`, `messageTimestamp` (segundos), `instanceId`, `source` (`android`, `ios`, `web`, `desktop`, `unknown`).

### Texto

```json
{
  "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0A1B2C3D4E5F6" },
  "pushName": "Padaria Central",
  "status": "DELIVERY_ACK",
  "message": { "conversation": "Oi, vi a página. Quanto custa?" },
  "contextInfo": null,
  "messageType": "conversation",
  "messageTimestamp": 1762770930,
  "instanceId": "8a1f...uuid",
  "source": "android"
}
```

### extendedText (texto com link, resposta ou citação)

O Evolution **normaliza** antes de enviar: `extendedTextMessage.text` vira `message.conversation`, `extendedTextMessage` é removido e `messageType` fica `conversation`. Os metadados (citação etc.) ficam em `contextInfo`.

```json
{
  "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0F0E1D2C3B4A5" },
  "pushName": "Padaria Central",
  "status": "DELIVERY_ACK",
  "message": { "conversation": "Pode mandar o link de novo? https://exemplo.com" },
  "contextInfo": {
    "stanzaId": "3EB0A1B2C3D4E5F6",
    "participant": "5511999999999@s.whatsapp.net",
    "quotedMessage": { "conversation": "Segue a página que preparei: ..." }
  },
  "messageType": "conversation",
  "messageTimestamp": 1762771000,
  "instanceId": "8a1f...uuid",
  "source": "ios"
}
```

Para ler o texto, basta `message.conversation`. Por segurança, trate também `message.extendedTextMessage?.text`.

### Imagem com legenda

```json
{
  "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0C9D8E7F6A5B4" },
  "pushName": "Padaria Central",
  "status": "DELIVERY_ACK",
  "message": {
    "imageMessage": {
      "url": "https://mmg.whatsapp.net/...",
      "mimetype": "image/jpeg",
      "caption": "Esse é o nosso cardápio",
      "fileLength": "123456",
      "height": 1280,
      "width": 960,
      "mediaKey": "...",
      "directPath": "/v/t62.7118-24/...",
      "jpegThumbnail": "..."
    },
    "base64": "/9j/4AAQSkZJRg..."
  },
  "contextInfo": null,
  "messageType": "imageMessage",
  "messageTimestamp": 1762771100,
  "instanceId": "8a1f...uuid",
  "source": "android"
}
```

- `message.base64` só vem com `base64: true` no webhook (sem prefixo `data:`).
- Sem `base64`, baixe depois com `POST /chat/getBase64FromMediaMessage/{instance}` (ver [mensagens-e-chat.md](mensagens-e-chat.md)).
- Formato serializado de campos binários (`mediaKey`, `jpegThumbnail`, `fileSha256`): não confirmado.

### fromMe (enviada pelo celular)

```json
{
  "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": true, "id": "3EB0AA11BB22CC33" },
  "pushName": "Gabriel",
  "status": "SERVER_ACK",
  "message": { "conversation": "Combinado, te mando amanhã." },
  "messageType": "conversation",
  "messageTimestamp": 1762771200,
  "instanceId": "8a1f...uuid",
  "source": "ios"
}
```

`pushName` de mensagem própria pode vir como `"Você"` quando o WhatsApp não manda o nome.

### remoteJid @lid

O WhatsApp pode identificar o contato por LID (`...@lid`) em vez do número. O Baileys 7 (`7.0.0-rc.9`) traz o número em `key.remoteJidAlt`. **Antes de enviar o webhook, o Evolution troca `remoteJid` pelo `remoteJidAlt`** quando o primeiro é `@lid` e o segundo existe. Por isso, na prática o webhook costuma chegar assim:

```json
{
  "key": {
    "remoteJid": "5511988887777@s.whatsapp.net",
    "remoteJidAlt": "5511988887777@s.whatsapp.net",
    "addressingMode": "lid",
    "fromMe": false,
    "id": "3EB0DD44EE55FF66"
  },
  "pushName": "Padaria Central",
  "message": { "conversation": "Oi" },
  "messageType": "conversation"
}
```

- O LID original não fica no `key` depois da troca. Valores exatos de `remoteJidAlt` e `addressingMode` nesse caso: não confirmado em teste.
- Se `remoteJidAlt` não vier, `remoteJid` continua `...@lid`. Trate esse caso (guarde o LID e associe depois).
- `senderPn` **não aparece** no código da 2.3.7. Era um campo do Baileys 6. Em grupos, o equivalente para o autor é `key.participantAlt`.
- Os eventos `contacts.upsert`/`contacts.update` disparados junto usam o `remoteJid` **original** (pode ser `@lid`).

## messages.update

`data` é um objeto por atualização:

```json
{
  "keyId": "3EB0A1B2C3D4E5F6",
  "remoteJid": "5511988887777@s.whatsapp.net",
  "fromMe": true,
  "participant": null,
  "status": "READ",
  "instanceId": "8a1f...uuid",
  "messageId": "clx..."
}
```

- `status`: `ERROR`, `PENDING`, `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `PLAYED`.
- `messageId` é o id da mensagem no banco do Evolution.
- Com `DATABASE_SAVE_DATA_NEW_MESSAGE` ou `DATABASE_SAVE_DATA_HISTORIC` ligados, a atualização **é descartada** se a mensagem original não estiver no banco.
- Mensagem apagada vira o evento `messages.delete`, com `{ ...key, "status": "DELETED" }`.

## connection.update

```json
{ "instance": "sharken", "state": "connecting", "statusReason": 200 }
```

```json
{
  "instance": "sharken",
  "wuid": "5511999999999@s.whatsapp.net",
  "profileName": "Gabriel",
  "profilePictureUrl": "https://pps.whatsapp.net/...",
  "state": "open",
  "statusReason": 200
}
```

```json
{ "instance": "sharken", "state": "close", "statusReason": 401 }
```

- `close` só vira webhook quando o Evolution **não** vai reconectar sozinho: `statusReason` 401 (loggedOut), 403 (forbidden), 402 ou 406. Nos outros códigos ele reconecta e você vê `connecting` de novo. Junto com o `close` vem `status.instance` com `status: "closed"`, `disconnectionReasonCode` e `disconnectionObject`.
- `refused`: limite de QR (`QRCODE_LIMIT`) atingido. Vem com `wuid`, `profileName`, `profilePictureUrl` e `statusReason: 428`.

## qrcode.updated

```json
{
  "qrcode": {
    "instance": "sharken",
    "pairingCode": null,
    "code": "2@y8eK+bjtEjUWy9/FOM...",
    "base64": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

Ao atingir o limite: `{ "message": "QR code limit reached, please login again", "statusCode": 500 }`.

## contacts.upsert / contacts.update

O formato muda conforme a origem:

| Origem | `data` |
|---|---|
| Junto com `messages.upsert` | **Objeto** único. `contacts.update` se o contato já existia no banco, `contacts.upsert` se é novo. |
| Sincronização do Baileys (`contacts.upsert`) | **Array**, primeiro com `profilePicUrl: null`, depois um `contacts.update` (array) com as fotos |
| Baileys `contacts.update` | **Array** |

```json
{
  "remoteJid": "5511988887777@s.whatsapp.net",
  "pushName": "Padaria Central",
  "profilePicUrl": "https://pps.whatsapp.net/v/t61.24694-24/...",
  "instanceId": "8a1f...uuid"
}
```

`profilePicUrl` é `null` quando a foto é privada ou não existe. A URL do WhatsApp expira. Baixe e guarde se precisar.

## chats.upsert

Sempre um **array**:

```json
[
  { "remoteJid": "5511988887777@s.whatsapp.net", "instanceId": "8a1f...uuid", "name": "Padaria Central", "unreadMessages": 1 }
]
```

Também é disparado (sem `name`, com `unreadMessages: 0`) depois de um `messages.update` de um chat existente, e com `{ id, name }` quando o `pushName` do contato muda.

## Retry e timeout (2.3.x)

Valem para webhook da instância e global. Fonte: `env.config.ts` e `webhook.controller.ts`.

| Variável | Padrão no código | O que faz |
|---|---|---|
| `WEBHOOK_REQUEST_TIMEOUT_MS` | `30000` (o `.env.example` usa 60000) | Timeout de cada POST |
| `WEBHOOK_RETRY_MAX_ATTEMPTS` | `10` | Tentativas no total |
| `WEBHOOK_RETRY_INITIAL_DELAY_SECONDS` | `5` | Espera inicial |
| `WEBHOOK_RETRY_USE_EXPONENTIAL_BACKOFF` | `true` | Só `false` desliga |
| `WEBHOOK_RETRY_MAX_DELAY_SECONDS` | `300` | Teto da espera |
| `WEBHOOK_RETRY_JITTER_FACTOR` | `0.2` | Variação aleatória (±20%) |
| `WEBHOOK_RETRY_NON_RETRYABLE_STATUS_CODES` | `400,401,403,404,422` | Status que param as tentativas na hora |

Consequências práticas:

- Responda **2xx rápido** no seu endpoint. Erro 5xx ou timeout gera até 10 reenvios (5 s, 10 s, 20 s... até 300 s), e o processamento pode chegar duplicado. Deduplique por `key.id`.
- O envio é `await` em sequência dentro do handler: um endpoint lento atrasa os próximos eventos daquela instância.

Webhook global (opcional, para todas as instâncias): `WEBHOOK_GLOBAL_ENABLED`, `WEBHOOK_GLOBAL_URL`, `WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS` e um `WEBHOOK_EVENTS_<EVENTO>=true` por evento. Erros da API podem ir para `WEBHOOK_EVENTS_ERRORS=true` + `WEBHOOK_EVENTS_ERRORS_WEBHOOK=<url>`.
