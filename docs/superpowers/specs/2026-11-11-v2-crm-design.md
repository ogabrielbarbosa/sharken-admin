# Versão 2: CRM

**Data:** 2026-11-11
**Status:** aguarda a revisão do Gabriel.
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

## 1. Objetivo

Uma tela só, como um WhatsApp, em que o Gabriel vê todos os contatos de prospecção, manda a primeira mensagem, faz o follow-up, conversa e leva o contato para o contrato. Substitui Abordar, Aguardar e Conversa.

## 2. Conexão com o WhatsApp

- **Provedor:** Evolution API, já instalada no servidor do Gabriel, com uma instância própria para o número de prospecção.
- **Variáveis:** `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` e `WHATSAPP_WEBHOOK_SECRET`.
- **Webhook:** `POST /api/webhooks/whatsapp?token=<WHATSAPP_WEBHOOK_SECRET>`, com os eventos de mensagem nova, atualização de status e conexão. Um comando `pnpm whatsapp:webhook` configura o webhook da instância.
- **Estado da conexão:** a tabela `whatsapp_connection` guarda o último estado recebido. O topo do CRM mostra "Conectado" ou "Desconectado", e desconectado abre um drawer com o QR Code da Evolution para reconectar.
- **Versão:** o adaptador é escrito para a versão da Evolution encontrada no servidor (v1 ou v2), conferida no início da implementação.

### Interface de provedor

Fica em `packages/integrations/src/whatsapp/`, inspirada na separação do LíderHub entre adaptador de entrada e remetente:

```ts
interface WhatsAppProvider {
  sendText(input: { phoneE164: string; text: string; clientMessageId: string }): Promise<{ externalId: string }>;
  normalize(raw: unknown): WhatsAppEvent[];   // webhook → eventos neutros
  connectionQr(): Promise<string | null>;
}

type WhatsAppEvent =
  | { kind: 'message'; externalId: string; phoneE164: string | null; lid: string | null; pushName: string | null;
      fromMe: boolean; text: string | null; media: InboundMedia | null; at: Date }
  | { kind: 'status'; externalId: string; status: 'enviada' | 'entregue' | 'lida' | 'erro' }
  | { kind: 'connection'; state: 'conectado' | 'desconectado' | 'conectando' };
```

O domínio do CRM só conhece essa interface. Trocar por Z-API ou pela API oficial é escrever um novo adaptador.

### Regras do número

- Mensagens de grupo, de status e de listas de transmissão são ignoradas.
- O telefone é normalizado para E.164 com o `phone.ts` que já existe. Para achar o contato, a busca tenta o número com e sem o nono dígito, como o LíderHub faz.
- Quando o WhatsApp mandar só o identificador LID, o sistema usa o número alternativo que vier no evento. Sem número, guarda o LID no contato e liga as próximas mensagens por ele.

## 3. Contatos

### Como um contato nasce

| Origem | Quando | Status inicial |
|---|---|---|
| `batch` | O Gabriel aprova o material do lead | `novo` |
| `whatsapp_direto` | Chega mensagem de um número que não é contato | `em_conversa` |
| `manual` | "Novo contato" no CRM, com nome e telefone | `novo` |

O telefone é único entre os contatos. Aprovar o material de um lead cujo telefone já é contato liga o lead a esse contato, sem criar outro.

### Status

| Status | Significado | Entra quando |
|---|---|---|
| `novo` | Pronto para o primeiro contato | Ao nascer de batch ou manual |
| `contatado` | Primeira mensagem enviada, sem resposta | O Gabriel envia a primeira mensagem |
| `follow_up` | Follow-up enviado, sem resposta | O Gabriel envia o follow-up |
| `em_conversa` | A pessoa respondeu | Chega a primeira mensagem dela |
| `fechado` | Negócio fechado | "Fechar negócio" (spec de Contrato) |
| `perdido` | Sem interesse ou sem resposta | O Gabriel marca |
| `nao_contatar` | Pediu para parar | O Gabriel confirma. É permanente |

As mudanças automáticas são só estas: envio da primeira mensagem, envio do follow-up e chegada de resposta. As outras o Gabriel faz pelo seletor de status. Toda mudança vira um evento no histórico.

Um contato `perdido` que manda mensagem volta para `em_conversa`. `nao_contatar` nunca volta: as mensagens dele aparecem, mas o campo de envio fica bloqueado.

## 4. Tela CRM

Três colunas, no menu lateral do painel, em `/painel/crm`.

### Coluna 1: caixas e lista

**Caixas, com contagem:**

| Caixa | Contatos |
|---|---|
| **Hoje** | Mensagem recebida sem resposta do Gabriel, follow-ups vencidos e cobranças vencidas (spec de Pagamento) |
| **Novos** | `novo` |
| **Aguardando** | `contatado` e `follow_up` |
| **Em conversa** | `em_conversa` |
| **Fechados** | `fechado` |
| **Perdidos** | `perdido` e `nao_contatar` |
| **Todos** | Todos |

**Lista:** nome, prévia da última mensagem, horário, contagem de não lidas e um selo do status. Ordem pela última mensagem, mais recente primeiro. Em Novos, a ordem é pela pontuação do lead. Busca por nome e telefone. Filtro por origem (batch).

### Coluna 2: conversa

- Mensagens em balões, com o horário e as marcas de status (relógio, enviada, entregue, lida e erro).
- Mensagens recebidas com imagem, áudio ou documento aparecem com player ou link. O envio da v2 é só texto.
- No topo da conversa de um contato que veio da v1, o histórico antigo (`events`) aparece como linhas cinza.
- **Campo de envio:** texto livre, com Enter para enviar e Shift+Enter para quebrar linha.
- **Mensagem pronta:** em `novo`, o campo já vem preenchido com a mensagem de primeiro contato do fluxo (`packages/config/src/messages.ts`), com o link da página. Em `contatado` com follow-up vencido, vem a mensagem de follow-up. O Gabriel lê, edita se quiser e envia.
- **Sugestão da IA:** um botão "Sugerir resposta" chama o `reply-suggestions.ts` com as últimas 20 mensagens e coloca o texto no campo, sem enviar. A regra continua: sem prometer preço, prazo ou condição, e `[valor]` quando o valor for necessário.
- **Pedido para parar:** quando uma mensagem recebida tiver palavras como "parar", "sair", "remover", "não quero" ou "não tenho interesse" (lista em `packages/config`), uma faixa pergunta "Marcar como Não contatar?". O Gabriel confirma ou fecha.

### Coluna 3: painel do contato

- Nome, telefone, origem (com link para o batch e o lead) e status, com seletor.
- **Página:** link, validade ("expira em 18 h"), Renovar por mais 24 h e Remover.
- **Vídeo:** prévia, quando houver.
- **Resumo do lead:** fluxo, motivo, pontuação e comentário interno, editável.
- **Follow-up:** data e anotação. Ver a seção 5.
- **Histórico:** mudanças de status, aberturas da página e envios.
- **Fechar negócio:** leva para o Contrato (spec de Contrato).

### Envios do dia

O topo mostra "Primeiros contatos hoje: 12 de 20". Passar de 20 (`DAILY_FIRST_CONTACT_LIMIT`) mostra um aviso antes de enviar, sem bloquear, como na v1.

## 5. Follow-up

- Ao enviar a primeira mensagem, o contato ganha `follow_up_at` = envio + 3 dias.
- O Gabriel pode mudar a data, escrever uma anotação ou remover o follow-up no painel do contato. Também pode criar um follow-up em qualquer status, por exemplo "cobrar resposta sobre o orçamento".
- No dia, o contato aparece em **Hoje** com um selo "Follow-up". O sistema não envia nada sozinho.
- **Limite:** para quem nunca respondeu, só um follow-up. Depois de `follow_up`, o campo de envio mostra "Já foi enviado um follow-up sem resposta" e bloqueia novas mensagens até a pessoa responder. O Gabriel pode marcar como perdido.
- Depois que a pessoa responde, os follow-ups são lembretes livres, sem limite, porque a conversa já existe.
- Responder um contato com follow-up vencido limpa o follow-up.

## 6. Ciclo de uma mensagem

### Envio

1. O painel gera um `client_message_id` e grava a mensagem como `pendente`, já visível no chat.
2. Uma server action chama `sendText` da Evolution.
3. Deu certo: grava o `external_id` e muda para `enviada`. Deu errado: muda para `erro` com a mensagem, e o balão mostra "Tentar de novo".
4. Sem retentativa automática. O Gabriel decide se reenvia.
5. Uma mensagem `pendente` há mais de 2 minutos vira `erro`.
6. O primeiro envio para um contato `novo` marca `sites.sent_at` e inicia a validade da página (spec de Material).

Antes de enviar, o servidor confere: contato fora de `nao_contatar`, telefone fora de `do_not_contact`, limite de follow-up e conexão ativa.

### Recebimento

O webhook confere o segredo e, para cada evento:

- **Mensagem:** acha ou cria o contato, grava a mensagem com `ON CONFLICT (external_id) DO NOTHING`, soma 1 às não lidas e atualiza `last_message_at` e `last_inbound_at`.
- **Mídia:** baixa o arquivo pela Evolution, grava no bucket `whatsapp-media` e guarda o caminho. O download vira tarefa, para o webhook responder rápido.
- **Status:** atualiza a mensagem, sem nunca voltar (`pendente` < `enviada` < `entregue` < `lida`; `erro` é final).
- **Mensagem do próprio número** (`fromMe`): é o eco de um envio do painel, ou uma mensagem enviada pelo celular. Procura primeiro pelo `external_id`. Se não achar, procura uma mensagem `pendente` do mesmo contato, com o mesmo texto, criada no último minuto, e liga as duas. Se ainda não achar, grava como enviada pelo celular. Assim, nada aparece duplicado.
- **Conexão:** atualiza `whatsapp_connection`.

O webhook sempre responde 200 depressa. Um erro de processamento vai para o log e para `events`, sem fazer a Evolution reenviar sem parar.

### Tempo real

O painel assina o Supabase Realtime nas tabelas `messages` e `contacts`, com o usuário logado. Uma mensagem nova aparece no chat e na lista sem recarregar. Abrir a conversa zera as não lidas, com um pequeno atraso para não gravar a cada mensagem.

## 7. Dados

### `contacts`

| Coluna | Observação |
|---|---|
| `id`, `created_at`, `updated_at` | |
| `name` | Nome do negócio, ou o nome do perfil do WhatsApp |
| `phone_e164` | Único |
| `whatsapp_lid` | Opcional |
| `lead_id` | Único, opcional |
| `origin` | `batch`, `whatsapp_direto`, `manual` |
| `batch_id` | Opcional |
| `status`, `status_at` | Seção 3 |
| `first_contact_at`, `responded_at` | |
| `follow_up_at`, `follow_up_note`, `follow_ups_without_reply` | |
| `last_message_at`, `last_message_preview`, `last_inbound_at`, `unread_count` | Para a lista |
| `comment` | Interno |

### `messages`

| Coluna | Observação |
|---|---|
| `id`, `created_at` | |
| `contact_id` | |
| `direction` | `entrada`, `saida` |
| `sent_from` | `painel`, `celular` (só para saída) |
| `kind` | `texto`, `imagem`, `audio`, `video`, `documento`, `outro` |
| `body` | Texto ou legenda |
| `media_path`, `media_mime` | |
| `status` | `recebida`, `pendente`, `enviada`, `entregue`, `lida`, `erro` |
| `error` | |
| `external_id` | Único, opcional enquanto `pendente` |
| `client_message_id` | Único, opcional |
| `is_first_contact`, `is_follow_up` | Para os limites e os números |
| `at` | Horário da mensagem no WhatsApp |

### `whatsapp_connection`

Uma linha: `state`, `updated_at` e `phone` (o número conectado).

### Segurança

RLS em todas as tabelas novas: só o usuário autenticado lê e escreve, como nas tabelas atuais. O webhook usa a chave de serviço.

## 8. O que veio do LíderHub, e o que ficou de fora

Veio a lógica, reescrita para este projeto:

- separação entre adaptador de entrada e remetente;
- mensagem gravada como pendente antes do envio, com id do cliente;
- deduplicação pelo id externo, status que não regride e pendentes vencidas;
- busca de telefone com e sem o nono dígito e tratamento do LID;
- prévia da última mensagem atualizada só por mensagem mais nova.

Ficou de fora: vários workspaces, times, atribuição, filas (RabbitMQ e Redis), funil configurável, etiquetas, envio agendado automático e janela de 24 horas (que só vale na API oficial). Nenhum nome, texto ou arquivo do LíderHub entra no projeto.

## 9. Erros

- **Evolution fora do ar ou desconectada:** o envio falha na hora, o balão mostra o erro, e o topo mostra "Desconectado".
- **Número sem WhatsApp:** a Evolution recusa. O painel oferece "Marcar telefone inválido", que descarta o contato como `perdido`, com motivo.
- **Webhook repetido:** não duplica nem regride.
- **Mensagem de número desconhecido:** cria o contato `whatsapp_direto`.

## 10. Testes

- Normalização e busca de telefone (nono dígito, LID, grupo ignorado).
- `normalize` da Evolution com exemplos reais de mensagem de texto, mídia, `fromMe`, status e conexão (guardados em `tests/fixtures`).
- Eco: envio pelo painel seguido do eco, com e sem `external_id` já gravado.
- Status sem regressão.
- Transições automáticas: primeiro envio, follow-up e resposta.
- Limite de follow-up e bloqueio de `nao_contatar`.
- Detecção de pedido para parar.
- Migração dos leads da v1 para contatos.
- Manual: com um segundo celular, receber, responder, mandar áudio, mandar mensagem pelo celular do número de prospecção e conferir que nada duplica.

## 11. Arquivos principais

- `packages/integrations/src/whatsapp/` (`provider.ts`, `evolution.ts`)
- `packages/domain/src/contacts.ts` (status, transições, limites), `stop-words.ts`
- `packages/db/src/contacts.ts`, `messages.ts`
- `apps/web/src/app/api/webhooks/whatsapp/route.ts`
- `apps/web/src/app/painel/crm/page.tsx` e `apps/web/src/components/crm/` (lista, conversa, painel e campo de envio)
- `apps/worker/src/jobs/download-media.ts`
