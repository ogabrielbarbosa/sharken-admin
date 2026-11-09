# Operação

## Vídeo

1. Edite os roteiros em `packages/config/src/scripts.ts`.
2. Rode `pnpm script:list` para ver cada trecho fixo e o nome do arquivo de áudio.
3. Grave os trechos em `assets/recordings/<fluxo>/<id>.mp3`.
4. Ligue o vídeo do fluxo em `packages/config/src/video.ts`.

Com o vídeo desligado, o material fica pronto só com a página, e a abordagem já funciona.

## Mensagens e prompts

- Mensagens de WhatsApp: `packages/config/src/messages.ts`
- Prompts da IA (análise, página e sugestão de resposta): `packages/config/src/prompts.ts`

## Contrato no ZapSign

Crie um modelo DOCX no ZapSign com os campos `{{NOME}}`, `{{DOCUMENTO}}`, `{{SERVICO}}`, `{{VALOR}}` e `{{DATA_INICIO}}`, e coloque o token dele em `ZAPSIGN_TEMPLATE_ID`.

## Antes do primeiro contato

- Número de WhatsApp dedicado, separado do pessoal.
- Análise de legítimo interesse (LGPD) registrada.
- Um lead fictício de cada fluxo, com o seu próprio telefone, passando por todas as etapas.
