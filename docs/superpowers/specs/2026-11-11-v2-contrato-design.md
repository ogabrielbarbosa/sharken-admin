# Versão 2: Contrato

**Data:** 2026-11-11
**Status:** aguarda a revisão do Gabriel. O texto do contrato é dele e continua em aberto.
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

## 1. Objetivo

Quando o Gabriel fecha com alguém no chat, um clique leva o contato para o contrato. Os dados que o sistema já tem são preenchidos sozinhos, o Gabriel completa o resto e o contrato vai para assinatura. O link de assinatura sai pelo próprio CRM.

## 2. Provedor

**ZapSign**, que já está integrado (`packages/integrations/src/zapsign.ts` e `/api/webhooks/zapsign`). A integração ganha uma interface (`ContractProvider`: `send`, `fileUrl` e `normalizeWebhook`), para trocar pelo Autentique depois, se o Gabriel preferir, sem mexer nas telas.

## 3. Fechar negócio

No painel do contato no CRM, **Fechar negócio** abre um drawer com três blocos.

### Cliente

Vem preenchido do contato e do lead. O que faltar, o Gabriel digita.

| Campo | De onde vem |
|---|---|
| Nome ou razão social | Nome do contato |
| CPF ou CNPJ | Digitado. Validado pelo dígito verificador |
| Responsável (quem assina) | Nome do perfil do WhatsApp, editável |
| E-mail | Digitado. Opcional, porque o link vai pelo WhatsApp |
| Telefone | Telefone do contato |
| Endereço | Endereço do lead |

Se o contato já é cliente, o bloco mostra o cliente existente, e o serviço novo fica nele.

### Serviço

Nome (padrão: "Site para [nome do negócio]"), tipo (único ou recorrente), valor, data de início e observações, como no drawer Novo serviço de hoje.

### Combinado do pagamento

| Campo | Observação |
|---|---|
| Forma | Pix, boleto ou cartão |
| Primeiro vencimento | Data |
| Periodicidade | Só para recorrente: mensal, trimestral, semestral ou anual |

O combinado não gera cobrança aqui. Ele é guardado no serviço e preenche a cobrança em Pagamento.

### Ao salvar

1. Cria ou atualiza o cliente, ligado ao contato e ao lead.
2. Cria o serviço, com o combinado.
3. Cria o contrato em `rascunho`.
4. Muda o contato para `fechado` e o lead para `vendido`.
5. Abre o contrato na tela Contratos.

Tudo em uma transação. Se uma parte falhar, nada fica pela metade.

## 4. Enviar para assinatura

- **Enviar para assinatura** gera o documento no ZapSign a partir do modelo, com os campos da seção 5, e guarda o link.
- **Mandar no WhatsApp** abre o CRM na conversa do contato com o campo de envio já preenchido: "Segue o contrato para assinatura: [link]". O Gabriel envia, como qualquer mensagem.
- **Copiar link**, para mandar por outro canal.
- O status volta pelo webhook do ZapSign, como hoje: `enviado` → `assinado` ou `recusado`. Webhook repetido não regride.
- Recusado pode ser corrigido e reenviado.
- Assinado faz o serviço aparecer em Pagamento como "Pronto para cobrar" (spec de Pagamento), e o histórico do contato ganha "Contrato assinado".

## 5. Campos do modelo

O modelo é criado pelo Gabriel no ZapSign com estas variáveis. As que não estiverem no modelo são ignoradas.

| Variável | Valor |
|---|---|
| `{{NOME}}` | Nome ou razão social |
| `{{DOCUMENTO}}` | CPF ou CNPJ formatado |
| `{{RESPONSAVEL}}` | Quem assina |
| `{{EMAIL}}` | E-mail |
| `{{TELEFONE}}` | Telefone formatado |
| `{{ENDERECO}}` | Endereço |
| `{{SERVICO}}` | Nome do serviço |
| `{{DESCRICAO}}` | Observações do serviço |
| `{{VALOR}}` | Valor em reais |
| `{{FORMA_PAGAMENTO}}` | Pix, boleto ou cartão |
| `{{VENCIMENTO}}` | Primeiro vencimento |
| `{{PERIODICIDADE}}` | Periodicidade, ou "pagamento único" |
| `{{DATA_INICIO}}` | Data de início |
| `{{DATA}}` | Data de hoje, por extenso |

O ID do modelo continua em `ZAPSIGN_TEMPLATE_ID`. Sem ele, "Enviar para assinatura" mostra o aviso que já existe.

## 6. Tela Contratos

No menu lateral, em `/painel/contratos`.

- **Filtro por status:** Rascunho, Enviado, Assinado e Recusado, com contagem.
- **Linha:** cliente, serviço, valor, status, data do último status e ações.
- **Ações:** Enviar para assinatura, Mandar no WhatsApp, Copiar link, Abrir PDF, Editar (só em rascunho e recusado) e Abrir cliente.

A tela Cliente continua mostrando os contratos de cada serviço, como hoje.

## 7. Dados

- `clients` ganha `contact_id` (único, opcional).
- `services` ganha `payment_method`, `first_due_date` e `cycle` (opcional).
- `contracts` ganha `sent_at`. O resto continua como está.

## 8. Erros

- **Falha no ZapSign:** nada muda localmente, e o erro aparece no drawer ou na linha, como hoje.
- **CPF ou CNPJ inválido:** o drawer não salva e aponta o campo.
- **Contato em `nao_contatar`:** Fechar negócio fica indisponível.

## 9. Testes

- Preenchimento a partir do contato e do lead.
- Validação de CPF e CNPJ.
- Transação de Fechar negócio: falha no meio não deixa cliente sem serviço nem contato `fechado` sem contrato.
- Montagem das variáveis do modelo.
- Webhook: assinado, recusado, repetido e fora de ordem.
- Manual: no ambiente de teste do ZapSign, fechar um contato fictício, enviar, assinar e conferir que ele aparece em Pagamento.

## 10. Arquivos principais

- `apps/web/src/components/crm/close-deal-drawer.tsx`
- `apps/web/src/app/painel/contratos/page.tsx`
- `packages/integrations/src/contracts/` (`provider.ts`, `zapsign.ts`, movido de `zapsign.ts`)
- `packages/domain/src/close-deal.ts`, `document.ts` (CPF e CNPJ)
- `packages/db/src/clients.ts`
