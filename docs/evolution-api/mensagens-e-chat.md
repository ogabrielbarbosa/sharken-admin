# Mensagens e chat

Fonte: `src/api/routes/{sendMessage,chat}.router.ts`, `src/validate/{message,chat}.schema.ts`, `src/api/dto/{sendMessage,chat}.dto.ts`, `src/api/services/channel.service.ts`, `whatsapp.baileys.service.ts` (tag 2.3.7).

| Método | Rota | HTTP de sucesso |
|---|---|---|
| POST | `/message/sendText/{instance}` | 201 |
| POST | `/chat/fetchProfilePictureUrl/{instance}` | 200 |
| POST | `/chat/findChats/{instance}` | 200 |
| POST | `/chat/findContacts/{instance}` | 200 |
| POST | `/chat/findMessages/{instance}` | 200 |
| POST | `/chat/markMessageAsRead/{instance}` | 201 |
| POST | `/chat/whatsappNumbers/{instance}` | 200 |
| POST | `/chat/getBase64FromMediaMessage/{instance}` | 201 |

`findChats`, `findContacts` e `findMessages` leem o **banco do Evolution**, não o celular. Dependem de `DATABASE_SAVE_DATA_NEW_MESSAGE`, `DATABASE_SAVE_DATA_CONTACTS`, `DATABASE_SAVE_DATA_CHATS` (e `..._HISTORIC` para histórico) ligados.

## POST /message/sendText/{instance}

```json
{
  "number": "5511988887777",
  "text": "Oi! Sou o Gabriel. Preparei uma página de exemplo para a Padaria Central: https://exemplo.com/padaria",
  "delay": 1200,
  "linkPreview": true,
  "quoted": {
    "key": { "id": "3EB0A1B2C3D4E5F6", "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "texto citado" }
  }
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `number` | sim | Só dígitos com DDI (`5511988887777`), ou JID completo (`...@s.whatsapp.net`, `...@g.us`, `...@lid`). `+`, espaços e parênteses são removidos. Para Brasil, o 9º dígito é ajustado automaticamente. |
| `text` | sim | Vazio ou só espaços: `400 Text is required`. |
| `delay` | não | Milissegundos com "digitando..." antes de enviar. Acima de 20 s, é feito em blocos de 20 s. |
| `linkPreview` | não | Só `false` desliga. Omitido ou `true` deixa o Baileys gerar a prévia. |
| `quoted` | não | `key.id` obrigatório. Sem `message`, o Evolution busca a mensagem original no banco pelo `key.id`. |
| `mentioned` | não | Array de números (grupos). |
| `mentionsEveryOne` | não | Marca todos (grupos). O schema declara `everyOne`, mas o DTO e o serviço leem `mentionsEveryOne`. |

Antes de enviar, o Evolution chama `whatsappNumbers` para o número. Se não existir no WhatsApp, a mensagem não sai.

Resposta (201), mesmo formato de mensagem salva:

```json
{
  "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": true, "id": "3EB0B7C6D5E4F3A2" },
  "pushName": "Você",
  "status": "PENDING",
  "message": { "conversation": "Oi! Sou o Gabriel. ..." },
  "contextInfo": { "mentionedJid": [], "groupMentions": [], "...": "..." },
  "messageType": "conversation",
  "messageTimestamp": 1762771300,
  "instanceId": "8a1f...uuid",
  "source": "unknown"
}
```

Guarde `key.id` para casar com os eventos `messages.update` (status `SERVER_ACK` → `DELIVERY_ACK` → `READ`). O envio também dispara o webhook `send.message` com o mesmo objeto. Valores exatos de `status` e `source` na resposta: não confirmado em teste.

### Número sem WhatsApp

```json
{
  "status": 400,
  "error": "Bad Request",
  "response": {
    "message": [
      { "jid": "5511988887777@s.whatsapp.net", "exists": false, "number": "5511988887777" }
    ]
  }
}
```

Verifique com `response.message[0].exists === false`. Outros erros de envio também vêm como `400`, com `response.message` sendo um array de **strings**.

## POST /chat/fetchProfilePictureUrl/{instance}

```json
{ "number": "5511988887777" }
```

```json
{ "wuid": "5511988887777@s.whatsapp.net", "profilePictureUrl": "https://pps.whatsapp.net/v/t61.24694-24/..." }
```

Sem foto, foto privada ou erro: `profilePictureUrl: null` (sempre 200). A URL expira. Baixe e guarde se precisar.

## POST /chat/findChats/{instance}

```json
{
  "where": { "remoteJid": "5511988887777" },
  "take": 50,
  "skip": 0
}
```

- Todos os campos são opcionais. `{}` lista tudo.
- `where.remoteJid` aceita número ou JID.
- `where.messageTimestamp: { "gte": "2026-11-01", "lte": "2026-11-10" }` filtra pela última mensagem (precisa dos dois).
- Paginação é `take`/`skip` (diferente de `findContacts` e `findMessages`).
- Só aparecem chats que têm **pelo menos uma mensagem** no banco. Ordem: mais recente primeiro.

```json
[
  {
    "id": "clx-contato",
    "remoteJid": "5511988887777@s.whatsapp.net",
    "pushName": "Padaria Central",
    "profilePicUrl": "https://pps.whatsapp.net/...",
    "updatedAt": "2026-11-10T12:15:00.000Z",
    "windowStart": "2026-11-10T12:00:00.000Z",
    "windowExpires": "2026-11-11T12:00:00.000Z",
    "windowActive": true,
    "lastMessage": {
      "id": "clx-msg",
      "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0..." },
      "pushName": "Padaria Central",
      "messageType": "conversation",
      "message": { "conversation": "Oi" },
      "messageTimestamp": 1762770930,
      "status": "DELIVERY_ACK"
    },
    "unreadCount": 1,
    "isSaved": true
  }
]
```

`windowStart`/`windowActive` são calculados a partir da criação do chat + 24 h. Não indicam a janela real da API oficial.

## POST /chat/findContacts/{instance}

```json
{ "where": { "remoteJid": "5511988887777" }, "offset": 100, "page": 1 }
```

- `where` aceita `remoteJid` (número ou JID), `id` e `pushName` (igualdade exata).
- `offset` é o **tamanho da página** e `page` começa em 1. Sem `offset`, devolve tudo.

```json
[
  {
    "id": "clx...",
    "remoteJid": "5511988887777@s.whatsapp.net",
    "pushName": "Padaria Central",
    "profilePicUrl": "https://pps.whatsapp.net/...",
    "createdAt": "2026-11-10T12:00:00.000Z",
    "updatedAt": "2026-11-10T12:15:00.000Z",
    "instanceId": "8a1f...uuid",
    "isGroup": false,
    "isSaved": true,
    "type": "contact"
  }
]
```

`type`: `group`, `contact` ou `group_member`. `isSaved` só indica que há `pushName` ou foto, não que o contato está salvo na agenda.

## POST /chat/findMessages/{instance}

```json
{
  "where": {
    "key": { "remoteJid": "5511988887777@s.whatsapp.net" },
    "messageTimestamp": { "gte": "2026-11-01T00:00:00Z", "lte": "2026-11-10T23:59:59Z" }
  },
  "offset": 50,
  "page": 1
}
```

- `where.key` aceita `id`, `remoteJid`, `remoteJidAlt`, `participant` e `fromMe`. `remoteJid` e `remoteJidAlt` são combinados com OU.
- `where.key.remoteJid` precisa ser **JID completo** (aqui não há conversão de número).
- `fromMe: false` é **ignorado** (o filtro só se aplica quando o valor é verdadeiro).
- `where.messageType`, `where.source` e `where.id` também filtram.
- `offset` é o tamanho da página (padrão 50) e `page` começa em 1. Ordem: mais recente primeiro.

```json
{
  "messages": {
    "total": 120,
    "pages": 3,
    "currentPage": 1,
    "records": [
      {
        "id": "clx...",
        "key": { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0..." },
        "pushName": "Padaria Central",
        "messageType": "conversation",
        "message": { "conversation": "Oi" },
        "messageTimestamp": 1762770930,
        "instanceId": "8a1f...uuid",
        "source": "android",
        "contextInfo": null,
        "MessageUpdate": [{ "status": "READ" }]
      }
    ]
  }
}
```

## POST /chat/markMessageAsRead/{instance}

```json
{
  "readMessages": [
    { "remoteJid": "5511988887777@s.whatsapp.net", "fromMe": false, "id": "3EB0A1B2C3D4E5F6" }
  ]
}
```

```json
{ "message": "Read messages", "read": "success" }
```

- Os três campos são obrigatórios em cada item.
- `remoteJid` precisa ser JID completo de pessoa (`@s.whatsapp.net`) ou grupo (`@g.us`). Itens com `@lid` ou só o número são **descartados em silêncio**, e a resposta continua `success`.
- Para não marcar tudo como lido automaticamente, deixe `readMessages: false` nas configurações da instância.

## POST /chat/whatsappNumbers/{instance}

```json
{ "numbers": ["5511988887777", "5511900000000"] }
```

```json
[
  { "jid": "5511988887777@s.whatsapp.net", "exists": true, "number": "5511988887777", "name": "Padaria Central" },
  { "jid": "5511900000000@s.whatsapp.net", "exists": false, "number": "5511900000000" }
]
```

- `jid` é o JID real que o WhatsApp devolveu (no Brasil, com ou sem o 9º dígito).
- `name` vem do banco de contatos, quando houver. `lid` aparece quando o resultado veio do cache com LID.
- Resultados positivos ficam em cache (`DATABASE_SAVE_IS_ON_WHATSAPP`, por `DATABASE_SAVE_IS_ON_WHATSAPP_DAYS` dias, padrão 7).
- Erro: responde `400` com o objeto do erro direto no corpo.

## POST /chat/getBase64FromMediaMessage/{instance}

```json
{
  "message": { "key": { "id": "3EB0C9D8E7F6A5B4" } },
  "convertToMp4": false
}
```

- `message` pode ser o objeto completo recebido no webhook (`key` + `message`), ou só `{ "key": { "id": ... } }`. Nesse caso, a mensagem é buscada no banco.
- `convertToMp4: true` converte áudio para `audio/mp4`.

```json
{
  "mediaType": "imageMessage",
  "fileName": "3EB0C9D8E7F6A5B4.jpeg",
  "caption": "Esse é o nosso cardápio",
  "size": { "fileLength": "123456", "height": 1280, "width": 960 },
  "mimetype": "image/jpeg",
  "base64": "/9j/4AAQSkZJRg...",
  "buffer": null
}
```

`base64` vem sem prefixo `data:`. Mensagem que não é mídia: `400` com `The message is not of the media type`. Mensagem não encontrada: `400`.
