# Versão 2: visão geral

**Data:** 2026-11-11
**Status:** fluxo e estados aprovados pelo Gabriel em 2026-11-11. O resto aguarda a revisão dele.
**Base:** `2026-11-06-sistema-de-prospeccao-design.md`. O que esta spec não muda continua valendo.

## 1. Por que mudar

A primeira versão termina no envio manual pelo `wa.me` e registra a conversa colando texto. Isso trava o volume. A versão 2:

- deixa a tela de leads mais limpa e acrescenta um passo para completar cada lead com mais material;
- gera páginas com design de verdade, publicadas em um subdomínio e com validade curta;
- troca a geração de vídeo por IA por um vídeo gravado pelo Gabriel, com o resto automatizado;
- troca Abordar, Aguardar e Conversa por um CRM ligado ao WhatsApp;
- leva o contato do CRM ao contrato e ao pagamento, sem redigitar dados.

## 2. Fluxo

```
Batch:     Leads → Completar → Material ──┐
                                          ▼
Global:                    CRM → Contrato → Pagamento → Cliente
```

| Etapa | Onde | Spec |
|---|---|---|
| Leads e Completar | Batch | `2026-11-11-v2-leads-design.md` |
| Material | Batch | `2026-11-11-v2-material-design.md` |
| CRM | Global | `2026-11-11-v2-crm-design.md` |
| Contrato | Global | `2026-11-11-v2-contrato-design.md` |
| Pagamento | Global | `2026-11-11-v2-pagamento-design.md` |

O batch cobre só Leads, Completar e Material. Quando o Gabriel aprova o material, o lead vira um **contato** do CRM, que reúne todos os batches. Contrato e Pagamento também ficam fora do batch.

## 3. Estados

### Lead (`leads.stage`)

`analisando` → `revisar` → `completar` → `gerando_material` → `revisar_material` → `crm` → `vendido`

- `revisar` continua com esse valor no banco. Na tela, chama "Leads".
- `completar` é novo: o lead foi aprovado e espera material extra (spec de Leads).
- `crm` é novo: o lead virou contato, e o status passa a ser o do contato.
- `vendido` é marcado quando o contato chega a `fechado`.
- Saídas: `descartado`, `sem_interesse` e `nao_contatar`, como hoje. `nao_contatar` continua permanente.
- `abordar`, `aguardando`, `follow_up_feito` e `conversa` deixam de ser usados. A migração leva esses leads para `crm` (seção 6).

### Contato (`contacts.status`)

`novo` → `contatado` → `follow_up` → `em_conversa` → `fechado`

Saídas: `perdido` e `nao_contatar`. Detalhes na spec do CRM.

### Contrato e cobrança

Continuam os da primeira versão: contrato `rascunho` → `enviado` → `assinado` / `recusado`, e cobrança `pendente` → `pago` / `vencido` / `cancelado`.

## 4. Decisões que valem para todos os módulos

- **Lead e contato:** um contato tem, no máximo, um lead de origem. Um contato pode existir sem lead (origem "WhatsApp direto" ou "manual").
- **Origem:** todo contato guarda a origem (`batch`, `whatsapp_direto` ou `manual`) e, quando vier de batch, qual foi.
- **WhatsApp:** Evolution API, já instalada no servidor do Gabriel, com uma instância própria para o número de prospecção. Fica atrás de uma interface de provedor (`packages/integrations/src/whatsapp/`), para trocar depois por Z-API ou pela API oficial.
- **Risco aceito:** a conexão não oficial pode levar ao banimento do número. O Gabriel aceitou esse risco em 2026-11-11. Isso substitui a frase "O app não envia mensagens de WhatsApp" da spec anterior.
- **Limites que continuam:** sem envio em massa, sem envio automático e sem rotação de números. Cada mensagem sai de um clique do Gabriel, um contato por vez. O follow-up agendado só avisa. No máximo um follow-up para quem nunca respondeu. Um pedido para parar leva a `nao_contatar`.
- **Configuração em arquivos:** mensagens, prompts e o guia de design das páginas ficam em `packages/config`, como hoje, sem tela.
- **Nome e domínio:** o nome comercial (`COMMERCIAL_NAME`) e o domínio das páginas (`PAGES_HOST`) são variáveis de ambiente. A confirmação do nome continua em aberto.
- **Marca do LíderHub:** a lógica de CRM pode ser estudada no LíderHub Web, mas nenhum nome, texto, marca ou arquivo dele entra neste projeto.

## 5. Arquitetura

| Parte | Muda? | O que faz na v2 |
|---|---|---|
| Next.js na Vercel | Sim | Painel, páginas no subdomínio (`PAGES_HOST`), webhooks da Evolution |
| Supabase | Sim | Tabelas novas, Realtime para o chat, arquivos dos leads, vídeos e páginas |
| Worker no Mac | Sim | Gera a página com o Claude Agent SDK, extrai texto dos links e arquivos, corta e converte os vídeos |
| Evolution API | Nova | Envia e recebe mensagens de WhatsApp |
| API do Claude | Igual | Análise, página, sugestão de resposta |
| ZapSign e Asaas | Igual | Contrato e cobrança |
| ElevenLabs e Remotion | Desligados | O código fica, atrás de `VIDEO_MODE=ia`. O padrão passa a ser `gravado` |

O painel chama a Evolution direto (ela está em um servidor sempre ligado). As mensagens recebidas chegam por webhook em `/api/webhooks/whatsapp`. Tarefas pesadas continuam na tabela `jobs`, com o worker do Mac.

### Tabelas novas e alteradas

| Tabela | Muda | Spec |
|---|---|---|
| `leads` | `stage` ganha `completar` e `crm` | Leads |
| `lead_assets` | Nova: links, arquivos e textos extras de cada lead | Leads |
| `sites` | Ganha `html_path`, `generator`, `published_at`, `sent_at` e `expires_at` opcional | Material |
| `videos` | Ganha `source` (`gravado` ou `ia`) e `original_path` | Material |
| `recording_sessions` | Nova: gravação longa com marcações por lead | Material |
| `contacts`, `messages` | Novas | CRM |
| `whatsapp_connection` | Nova, com uma linha: estado da conexão | CRM |
| `clients` | Ganha `contact_id` | Contrato |
| `services` | Ganha o combinado: `payment_method`, `first_due_date` e `cycle` | Contrato |
| `contracts` | Ganha `sent_at` | Contrato |
| `charges` | Ganha `paid_at` | Pagamento |

## 6. Migração dos dados atuais

Uma migração nova (`0002_v2.sql`), aplicada com `pnpm db:migrate`. Ela não apaga dados.

| Lead hoje | Vira lead | Contato criado com status |
|---|---|---|
| `abordar` | `crm` | `novo` |
| `aguardando` | `crm` | `contatado` |
| `follow_up_feito` | `crm` | `follow_up` |
| `conversa` | `crm` | `em_conversa` |
| `vendido` | `vendido` | `fechado` |

O contato herda `contacted_at`, `follow_up_at` e `responded_at` do lead. O histórico de `events` continua ligado ao lead. As mensagens antigas não existem como mensagens: o painel mostra os eventos antigos como linhas de histórico no topo da conversa.

## 7. Telas

| Tela | Situação |
|---|---|
| Barra de etapas do batch | Leads, Completar e Material |
| Leads | Reescrita (spec de Leads) |
| Completar | Nova, em tela cheia, lead por lead |
| Material | Reescrita, com página e vídeo |
| Sessão de gravação | Nova |
| CRM | Nova, no menu lateral |
| Contratos | Nova, no menu lateral |
| Pagamentos | Nova, no menu lateral |
| Abordar, Aguardar, Conversa e Vendido | Saem. As rotas antigas redirecionam para o CRM |
| Overview, Batches, Clientes, Cliente e Lead | Ajustes de rótulo e de link. O funil passa a contar os status do CRM |

As telas ficam em `untitled.pen`, em uma seção "v2".

## 8. Ordem de construção

1. **Base da v2:** migração, estados novos, barra de etapas, interface de WhatsApp e variáveis de ambiente.
2. **Leads e Completar.**
3. **Material:** página e vídeo. Pode correr em paralelo com o CRM.
4. **CRM.**
5. **Contrato e Pagamento,** juntos, porque reaproveitam o que já existe em Clientes.
6. **Limpeza:** redirecionar as rotas antigas, ajustar Overview e Lead e atualizar o CLAUDE.md.

Cada módulo tem testes automatizados para regras de domínio (transições, limites, deduplicação, validade da página) e um teste manual de ponta a ponta com um lead fictício.

## 9. Em aberto

1. Confirmação do nome comercial e do domínio das páginas (Sharken ou outro).
2. Modelo de contrato no ZapSign, que depende do Gabriel.
3. Versão da Evolution API no servidor (v1 ou v2). O adaptador segue a versão encontrada.
