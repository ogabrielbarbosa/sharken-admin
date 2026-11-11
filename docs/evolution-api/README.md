# Evolution API v2: referência

Referência curta para integrar com a Evolution API v2 (canal Baileys, WhatsApp Web). Escrita a partir do código-fonte da tag `2.3.7` e conferida com a documentação oficial. Quando as duas divergem, vale o código, e a divergência está anotada.

## Versão

| Item | Valor |
|---|---|
| Versão estável | **2.3.7**, lançada em **2025-12-05** |
| Imagem Docker | `evoapicloud/evolution-api:v2.3.7` |
| Próxima versão | 2.4.0 ainda é pré-release (`2.4.0-rc1` em 2026-05-06, `2.4.0-rc2` em 2026-05-17) |
| Baileys embutido | `7.0.0-rc.9` |
| Conferir a versão rodando | `GET /` devolve `version` (ver [docker.md](docker.md)) |

## Autenticação

Todas as rotas (exceto `GET /`) exigem o header `apikey`.

```http
apikey: <chave>
```

| Chave | Origem | O que acessa |
|---|---|---|
| Global | Variável `AUTHENTICATION_API_KEY` | Tudo. Necessária para `POST /instance/create`. |
| Token da instância | Campo `token` no create, ou o `hash` gerado (UUID maiúsculo) que volta na resposta | Só as rotas `/{rota}/{instanceName}` daquela instância, e `GET /instance/fetchInstances` (filtrado para ela) |

Sem header: `401`. Chave errada: `401`. Instância inexistente: `404` com `The "<nome>" instance does not exist`.

### Formato de erro (código-fonte)

```json
{ "status": 400, "error": "Bad Request", "response": { "message": ["..."] } }
```

A documentação oficial mostra `{ "success": false, "error": { "code": "BAD_REQUEST", ... } }`. Esse formato **não existe** no código da 2.3.7.

## Links oficiais

- Repositório: https://github.com/evolution-foundation/evolution-api (tag `2.3.7`)
- Documentação: https://doc.evolution-api.com (hoje redireciona para https://docs.evolutionfoundation.com.br/evolution-api/). O índice das páginas está em https://docs.evolutionfoundation.com.br/llms.txt.
- Changelog: `CHANGELOG.md` na raiz do repositório
- Imagem: https://hub.docker.com/r/evoapicloud/evolution-api

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [instancia.md](instancia.md) | Criar, conectar (QR e pairing code), estado, listar, logout, apagar, reiniciar |
| [webhook.md](webhook.md) | `webhook/set`, `webhook/find`, eventos, payloads e variáveis de retry |
| [mensagens-e-chat.md](mensagens-e-chat.md) | `sendText`, foto de perfil, `findChats`, `findContacts`, `findMessages`, marcar como lida, checar números, baixar mídia |
| [docker.md](docker.md) | Variáveis de ambiente para rodar local com Postgres e Redis, acesso ao host, `GET /` |

## Convenções usadas aqui

- `{instance}` é o `instanceName` (o nome, não o UUID).
- JID de pessoa: `5511999999999@s.whatsapp.net`. Grupo: `...@g.us`. Identificador oculto (LID): `...@lid`.
- "não confirmado" marca o que não foi possível verificar no código nem num teste.
