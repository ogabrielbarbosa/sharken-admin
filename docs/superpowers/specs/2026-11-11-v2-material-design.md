# Versão 2: Material

**Data:** 2026-11-11
**Status:** substituída por `2026-11-11-v2-pipeline-design.md` (página e vídeo agora são feitos pelo Gabriel e anexados como links).
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

## 1. Objetivo

Para cada lead que sai de Completar, o sistema monta uma **página de exemplo** com design de verdade e um **vídeo gravado pelo Gabriel**, e os dois ficam em um endereço próprio, por exemplo `pages.sharken.com.br/clinica-dr-joao-x7k2`, que expira pouco depois do envio.

## 2. Como gerar a página

O Gabriel já consegue boas páginas mandando os dados ao Claude no Desktop. A ideia é fazer o mesmo sem ele no meio.

### Opções avaliadas

| Opção | Como funciona | Prós | Contras |
|---|---|---|---|
| **A. Agente no worker (recomendada)** | O worker roda o Claude Agent SDK com um guia de design e os dados do lead, e o agente escreve um `index.html` completo | Cada página tem um desenho próprio, como no Desktop. Roda sozinho, em fila | Custa mais por página e demora de 1 a 3 minutos. Precisa de checagens para não inventar fatos nem quebrar no celular |
| B. Template em código, melhorado | A IA preenche textos, e um template React fixo, com variações, faz o desenho | Barato, rápido e previsível. É o que existe hoje | Todas as páginas ficam parecidas |
| C. Manual pelo Claude Desktop | O Gabriel gera no Desktop e envia o HTML no painel | Qualidade máxima | Não escala, e é o trabalho que o sistema deveria tirar dele |

**Recomendação: A**, com o template atual (B) como reserva. Se o agente falhar 3 vezes, o lead pode usar o template atual com um clique.

### Como o agente trabalha

1. O worker pega a tarefa `build_page` e cria uma pasta temporária com:
   - `brief.json`: dados do lead, fluxo, motivo, avaliações (sem autor) e cores do site atual, quando houver;
   - `material/`: textos extraídos dos itens de Completar, e as fotos já copiadas para o Storage, com as URLs públicas;
   - `GUIA.md`: o guia de design, copiado de `packages/config/src/page-design/GUIA.md`.
2. O worker roda o agente com o Claude Agent SDK, nesta pasta, só com ferramentas de leitura e escrita de arquivo. Sem terminal e sem internet.
3. O agente escreve `index.html`: um arquivo só, com CSS próprio, sem JavaScript, e com as imagens apontando para as URLs do Storage.
4. O worker confere o resultado (próxima seção). Se passar, sobe o arquivo para `pages/<slug>/index.html` no Storage e grava uma captura de tela do celular e do computador.

O modelo e o limite de turnos ficam em `packages/config/src/page-design/config.ts`. O padrão é o Opus mais recente, e o custo por página é medido no primeiro lote para decidir se vale trocar.

### O guia de design (`GUIA.md`)

É o "system prompt" da página, mantido pelo Gabriel como arquivo do projeto. A primeira versão diz:

- **Seções:** topo com o que o negócio faz e botão de WhatsApp, espaço do vídeo, serviços, sobre, fotos, avaliações, localização e contato. Seções sem dado somem.
- **Espaço do vídeo:** um elemento `<div data-slot="video"></div>` logo abaixo do topo. O servidor coloca o vídeo ali.
- **Fatos:** só o que está no `brief.json` e em `material/`. Preço, certificação, anos de experiência e número de clientes nunca são inventados.
- **Fotos:** só as fornecidas. Com menos de 3, usar formas e cores em vez de fotos de banco.
- **Celular primeiro:** legível a partir de 360 px, botões de pelo menos 44 px.
- **Marca:** as cores do site atual ou do logo, quando houver. Senão, uma paleta coerente com o tipo de negócio.
- **Aviso fixo:** "Modelo preparado por [nome comercial]. Ainda não publicado." no rodapé.

### Checagens antes de aprovar

| Checagem | Falha leva a |
|---|---|
| O HTML tem `data-slot="video"`, não tem `<script>` e não carrega nada fora do Storage e do Google Fonts | Nova tentativa |
| O texto visível passa pelo `findUnsupportedClaims` que já existe, contra o brief e o material | Nova tentativa, com as frases problemáticas no pedido |
| Abre no Playwright em 390 px e 1280 px sem rolagem horizontal | Nova tentativa |
| Telefone e nome do negócio aparecem na página | Nova tentativa |

Até 3 tentativas. Depois, o lead fica com erro em Material, com "Tentar de novo" e "Usar template simples".

### Refazer com instrução

Em Material, "Refazer" abre um campo de texto ("deixa mais sóbrio", "tira a seção de fotos") que vai junto na próxima geração, com o HTML anterior como ponto de partida.

## 3. Endereço e validade

### Subdomínio

- `PAGES_HOST` (por exemplo `pages.sharken.com.br`) aponta para o mesmo projeto na Vercel.
- O `middleware.ts` do Next.js reescreve `PAGES_HOST/<slug>` para `/p/<slug>`. No domínio do painel, `/p/<slug>` continua funcionando, para não quebrar links antigos.
- O slug é o nome do negócio, simplificado, mais 4 caracteres aleatórios: `clinica-dr-joao-x7k2`.

### Como a página é servida

`/p/<slug>` passa a ser uma rota que:

1. busca o registro em `sites`;
2. confere a validade;
3. lê o `index.html` do Storage, coloca o player do vídeo no `data-slot="video"` e o script de abertura que já existe (`open-beacon`);
4. responde com `X-Robots-Tag: noindex` e uma Content Security Policy que só libera o Storage, o Google Fonts e o script de abertura.

Páginas antigas, geradas pelo template (`generator = 'template'`), continuam sendo desenhadas pelo `SiteTemplate`.

### Validade

| Momento | Regra |
|---|---|
| Página aprovada, ainda não enviada | Abre sem prazo para o Gabriel conferir. Se não for enviada em 7 dias, expira |
| Primeira mensagem com o link enviada pelo CRM | `expires_at` = envio + `PAGE_TTL_HOURS` (padrão 24) |
| Renovar | O painel do contato no CRM tem "Renovar por mais 24 h" |
| Remover | Como hoje, na tela Lead e no CRM |

Depois de expirada, a página mostra uma mensagem neutra: "Este modelo não está mais disponível." com um botão de WhatsApp para o número de prospecção, para quem quiser pedir de novo.

## 4. Tela Material

Duas seções, como hoje:

- **Em geração:** status por lead ("Montando a página · tentativa 2 de 3", "Erro", "Faltam dados"), com "Tentar de novo" e "Usar template simples".
- **Prontos para revisão:** cartão com a captura de tela do celular, o status do vídeo e os botões **Abrir página**, **Refazer** (com instrução), **Enviar vídeo** e **Aprovar**.

Aprovar leva o lead para `crm` e cria o contato com status `novo` (spec do CRM). O vídeo não é obrigatório para aprovar.

## 5. Vídeo gravado

O vídeo por IA (roteiro, ElevenLabs e Remotion) fica desligado (`VIDEO_MODE=gravado`). O código continua no projeto.

### Envio por lead

O Gabriel grava o vídeo de cada lead do jeito que preferir e, no cartão do lead, clica em **Enviar vídeo** para mandar o arquivo (MP4, MOV ou WebM, até 500 MB). O worker converte para MP4 H.264 de até 1080p e grava em `videos`. **Trocar vídeo** substitui o arquivo.

O sistema não tem tela própria de gravação nem corta vídeos longos (decisão do Gabriel em 2026-11-11).

### Regras

- Upload direto do navegador para o Storage, por URL assinada e envio em partes. O arquivo não passa pela Vercel.
- O original fica 7 dias e depois é apagado. Fica só o convertido.
- O vídeo aparece só dentro da página, como hoje.
- A regra de transparência continua: o vídeo pode mostrar que o modelo foi preparado para aquele negócio, sem dizer que tudo foi feito à mão só para ele.

## 6. Dados

### `sites`

| Coluna | Mudança |
|---|---|
| `generator` | Nova: `template` ou `agente` |
| `html_path` | Nova: caminho do `index.html` no Storage |
| `screenshots` | Nova: `{ mobile, desktop }` |
| `published_at` | Nova: data da aprovação |
| `sent_at` | Nova: primeiro envio do link pelo CRM |
| `expires_at` | Passa a aceitar nulo, enquanto a página não foi enviada |
| `attempts`, `instruction` | Novas: tentativas e instrução do "Refazer" |

### `videos`

Ganha `source` (`gravado` ou `ia`) e `original_path`.

## 7. Erros

- **Agente falha 3 vezes:** erro no lead, com "Tentar de novo" e "Usar template simples".
- **Upload interrompido:** o envio em partes continua de onde parou.
- **Vídeo em formato que não converte:** o cartão mostra o erro e pede outro arquivo.
- **Mac desligado:** páginas e conversões esperam na fila, como hoje.

## 8. Testes

- Slug: normalização de acentos e colisão.
- Validade: sem prazo antes do envio, 24 h depois, renovação e 7 dias sem envio.
- Checagens do HTML: com script, sem o espaço do vídeo, com domínio externo e com afirmação inventada.
- Conversão: MOV do iPhone (HEVC) vira MP4 H.264.
- Middleware: host de páginas e host do painel.
- Manual: gerar 3 páginas de tipos de negócio diferentes, abrir no celular, enviar um vídeo do iPhone e conferir que ele toca no Chrome e no Safari.

## 9. Arquivos principais

- `apps/worker/src/jobs/build-page.ts` (substitui `generate-page.ts`, que fica para o template simples)
- `apps/worker/src/jobs/transcode-video.ts`
- `packages/config/src/page-design/GUIA.md` e `config.ts`
- `packages/domain/src/page-checks.ts`, `page-expiry.ts`, `recording-cuts.ts`
- `apps/web/src/middleware.ts`, `apps/web/src/app/p/[slug]/route.ts`
- `apps/web/src/app/painel/batches/[id]/material/page.tsx` e `gravar/page.tsx`
