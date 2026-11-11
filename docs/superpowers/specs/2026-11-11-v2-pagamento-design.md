# Versão 2: Pagamento

**Data:** 2026-11-11
**Status:** aguarda a revisão do Gabriel.
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

## 1. Objetivo

Depois do contrato assinado, o Gabriel gera o link de pagamento com o combinado já preenchido, manda pelo CRM e acompanha até o dinheiro entrar. Substitui a etapa Vendido.

## 2. Provedor

**Asaas**, que já está integrado (`packages/integrations/src/asaas.ts` e `/api/webhooks/asaas`), com cobrança avulsa e assinatura para serviço recorrente. Os avisos automáticos do Asaas continuam desligados: quem manda o link é o Gabriel.

## 3. Tela Pagamentos

No menu lateral, em `/painel/pagamentos`. Três seções.

### Pronto para cobrar

Serviços com contrato assinado e sem cobrança emitida. Cada linha mostra cliente, serviço, valor e o combinado (forma, vencimento e periodicidade), com **Gerar cobrança**.

Um serviço sem contrato (criado direto em Clientes) não aparece aqui: a cobrança dele continua sendo criada na tela Cliente, como hoje.

### Em aberto

Cobranças `pendente` e `vencido`, com cliente, descrição, valor, vencimento, forma, status e ações. Vencidas primeiro, em vermelho.

### Pagas

Cobranças `pago` dos últimos 30 dias, com a data do pagamento. Um link leva ao histórico completo na tela Cliente.

### Números no topo

Os mesmos da spec anterior: faturado, recebido, em aberto e em atraso, calculados pelo `finance.ts` que já existe.

## 4. Gerar cobrança

**Gerar cobrança** abre o drawer Nova cobrança que já existe, preenchido com o combinado:

| Campo | Vem de |
|---|---|
| Descrição | Nome do serviço |
| Valor | Valor do serviço |
| Vencimento | Primeiro vencimento do combinado |
| Forma | Forma do combinado |
| Recorrência | Periodicidade, para serviço recorrente |

O Gabriel confere, ajusta se precisar e confirma. O sistema cria o cliente no Asaas, se ainda não existir, e a cobrança ou a assinatura, como hoje.

## 5. Mandar o link

Cada cobrança em aberto tem:

- **Mandar no WhatsApp:** abre o CRM na conversa do contato com o campo preenchido: "Segue o link para pagamento de [descrição], no valor de [valor], com vencimento em [data]: [link]". O Gabriel envia.
- **Copiar link.**

O texto fica em `packages/config/src/messages.ts`.

## 6. Pagamento recebido

- O webhook do Asaas atualiza a cobrança, como hoje, sem duplicar nem regredir.
- Pago: o histórico do contato ganha "Pagamento recebido", e a linha passa para Pagas.
- Primeiro pagamento de um serviço: o serviço fica `ativo` e o cliente aparece como "Em dia" em Clientes.
- Vencido: a cobrança vai para o topo de Em aberto, e o contato aparece em **Hoje** no CRM com um selo "Pagamento vencido", para o Gabriel cobrar. O sistema não manda nada sozinho.

## 7. Dados

Sem tabelas novas. Usa `services`, com o combinado da spec de Contrato, e `charges`. `charges` ganha `paid_at`, preenchido pelo webhook.

## 8. Erros

- **Falha no Asaas:** nada muda localmente, e o erro aparece no drawer ou na linha, como hoje.
- **Contato sem conversa no CRM** (cliente criado direto em Clientes): "Mandar no WhatsApp" cria o contato com origem `manual` antes de abrir a conversa.

## 9. Testes

- "Pronto para cobrar": só serviço com contrato assinado e sem cobrança.
- Preenchimento do drawer pelo combinado, para serviço único e recorrente.
- Webhook pago e vencido, com o efeito no contato e no serviço.
- Manual: no sandbox do Asaas, gerar a cobrança do contato fictício da spec de Contrato, pagar e conferir que tudo fecha.

## 10. Arquivos principais

- `apps/web/src/app/painel/pagamentos/page.tsx`
- `apps/web/src/components/clients/` (drawer Nova cobrança, que passa a aceitar valores iniciais)
- `packages/domain/src/billing-status.ts`, `finance.ts`
- `apps/web/src/app/api/webhooks/asaas/route.ts`
