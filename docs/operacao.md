# Operação

## Páginas

O worker gera a página de cada lead com um agente (API do Claude), no job `build_page`. Cada geração custa tokens: o custo em dólares e o número de tentativas ficam no evento `pagina_gerada` do lead (campo `cost_usd`, visível no Histórico). O modelo é `PAGE_AGENT_MODEL` e o guia de design fica em `packages/config/src/page-design/`.

A página é publicada em `PAGES_HOST` e vale `PAGE_TTL_HOURS` (24 h) depois do envio. Depois disso, mostra um botão para o WhatsApp de prospecção (`PROSPECT_WHATSAPP`).

## Vídeo

Por padrão (`VIDEO_MODE=gravado`) você grava o vídeo de cada lead e o envia pelo painel, em Material. O worker não gera vídeo.

O vídeo por IA fica desligado. Para ligar, use `VIDEO_MODE=ia` e:

1. Edite os roteiros em `packages/config/src/scripts.ts`.
2. Rode `pnpm script:list` para ver cada trecho fixo e o nome do arquivo de áudio.
3. Grave os trechos em `assets/recordings/<fluxo>/<id>.mp3`.
4. Ligue o vídeo do fluxo em `packages/config/src/video.ts`.

## WhatsApp

- Configuração e webhook: `docs/ambientes.md`, seção "WhatsApp (Evolution API)". Rode `pnpm whatsapp:webhook` depois de configurar as variáveis e sempre que a URL do app mudar.
- Cada mensagem sai de um clique seu, um contato por vez. `DAILY_FIRST_CONTACT_LIMIT` só avisa quando o dia passa do limite de primeiros contatos.
- A conexão não é oficial e o número pode ser banido (risco aceito em 2026-11-11). Use um número dedicado, separado do pessoal.

## Mensagens e prompts

- Mensagens de WhatsApp: `packages/config/src/messages.ts`
- Prompts da IA (análise, página e sugestão de resposta): `packages/config/src/prompts.ts`

## Contrato no ZapSign

Crie um modelo DOCX no ZapSign com os campos `{{NOME}}`, `{{DOCUMENTO}}`, `{{SERVICO}}`, `{{VALOR}}` e `{{DATA_INICIO}}`, e coloque o token dele em `ZAPSIGN_TEMPLATE_ID`.

## Antes do primeiro contato

- Número de WhatsApp dedicado, separado do pessoal, conectado na Evolution.
- Análise de legítimo interesse (LGPD) registrada.
- Um lead fictício de cada fluxo, com o seu próprio telefone, passando por todas as etapas: Leads, Completar, Material, CRM, Fechar negócio, Contrato e Pagamento (sandbox).
