# Operação

## Página e vídeo

O sistema não gera página nem vídeo. Você monta a página de exemplo e grava o vídeo (por exemplo, no Loom) fora do sistema e anexa os dois links no lead, no quadro do batch. Os links aparecem no cartão do lead e no contato do CRM.

## WhatsApp

- Configuração e webhook: `docs/ambientes.md`, seção "WhatsApp (Evolution API)". Rode `pnpm whatsapp:webhook` depois de configurar as variáveis e sempre que a URL do app mudar.
- Cada mensagem sai de um clique seu, um contato por vez. `DAILY_FIRST_CONTACT_LIMIT` só avisa quando o dia passa do limite de primeiros contatos.
- A conexão não é oficial e o número pode ser banido (risco aceito em 2026-11-11). Use um número dedicado, separado do pessoal.

## Mensagens e prompts

- Mensagens de WhatsApp: `packages/config/src/messages.ts`
- Prompts da IA (análise e sugestão de resposta): `packages/config/src/prompts.ts`

## Contrato no ZapSign

Crie um modelo DOCX no ZapSign com os campos `{{NOME}}`, `{{DOCUMENTO}}`, `{{SERVICO}}`, `{{VALOR}}` e `{{DATA_INICIO}}`, e coloque o token dele em `ZAPSIGN_TEMPLATE_ID`.

## Antes do primeiro contato

- Número de WhatsApp dedicado, separado do pessoal, conectado na Evolution.
- Análise de legítimo interesse (LGPD) registrada.
- Um lead fictício de cada fluxo, com o seu próprio telefone, passando por todas as etapas: Novo lead, Qualificado, Página, Vídeo, Pronto para abordar, CRM, Fechar negócio, Contrato e Pagamento (sandbox).
