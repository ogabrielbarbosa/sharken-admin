# Versão 2: Leads e Completar

**Data:** 2026-11-11
**Status:** aguarda a revisão do Gabriel.
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

> Nota: as seções 2 (Avançar) e 3 foram substituídas por `2026-11-11-v2-pipeline-design.md`.

## 1. Objetivo

Hoje, Revisar mostra cada lead como um cartão grande, com análise, motivo e comentário abertos ao mesmo tempo, e o "Avançar selecionados" manda tudo direto para a geração. A v2:

- muda o nome da etapa para **Leads** e troca os cartões por uma lista compacta;
- acrescenta **Completar**, um passo em que o Gabriel junta mais material de cada lead antes da página ser gerada.

A busca, a análise, a pontuação e os filtros de hoje continuam iguais.

## 2. Tela Leads

### Lista

Uma linha por lead, ordenada por pontuação:

| Coluna | Conteúdo |
|---|---|
| Seleção | Caixa de seleção |
| Negócio | Nome, tipo e cidade |
| Site | Situação (Sem site, Só rede social, Fora do ar, Funcionando), com o link que abre em outra aba |
| Instagram | Ativo ou parado, com a data do último post e o link |
| Avaliações | Nota e quantidade |
| Pontuação | Número e barra |
| Ações | Avançar e Descartar |

Clicar no nome abre um **painel lateral** com o resto: critérios atendidos e não atendidos, sinais do site, resumo da IA, motivo (só no fluxo melhorar site) e comentário interno. O painel tem Avançar, Descartar e "Não contatar", e as setas do teclado passam para o lead anterior ou o próximo.

### Filtros

Os filtros de hoje (`review-filters.tsx` e `review-filter.ts`) ficam em uma barra acima da lista, com as contagens de cada opção. Nenhum filtro novo.

### Seleção e ações em lote

Com um ou mais leads selecionados, uma barra fixa aparece no rodapé: "3 selecionados · Descartar · Avançar". "Selecionar todos" só pega os leads visíveis no filtro.

### Avançar

Avançar, sozinho ou em lote, leva os leads para `completar` e abre a tela Completar com eles, na ordem da lista. O motivo deixa de ser exigido em Leads e passa a ser preenchido em Completar.

### Busca em andamento

O bloco "Buscando no Google Maps" e "Analisando" continua no topo enquanto o batch roda.

## 3. Tela Completar

Uma tela cheia, um lead por vez, com "2 de 7" no topo e uma lista lateral com os nomes, para pular de um para outro.

### Coluna da esquerda: o que o sistema já tem

Nome, telefone, endereço, categorias, nota, fotos encontradas, site e Instagram, com links que abrem em outra aba.

### Coluna da direita: o que o Gabriel acrescenta

| Campo | Uso |
|---|---|
| **Links** | Qualquer URL: site atual, Instagram, Linktree, Doctoralia, LinkedIn, página de currículo. Um por linha, com rótulo opcional |
| **Arquivos** | PDF, imagens e documentos. Arrastar e soltar, até 20 MB cada |
| **Texto** | Notas livres para a página: especialidades, formação, diferenciais, horários |
| **Motivo** | Só no fluxo melhorar site. Vem da análise, é editável e obrigatório para gerar o material |
| **Comentário** | Interno, como hoje |

Tudo salva sozinho ao sair do campo.

### Ações

- **Gerar material e próximo:** leva o lead para `gerando_material` e passa para o próximo.
- **Pular:** passa para o próximo e deixa o lead em `completar`.
- **Descartar:** como hoje.

Nenhum campo é obrigatório, fora o motivo no fluxo melhorar site. Um lead sem nada acrescentado gera a página só com os dados da busca, como hoje.

Ao sair com leads ainda em `completar`, eles ficam numa aba "Completar" da barra de etapas, com o número de pendentes, para retomar depois.

## 4. Extração do material

Cada item acrescentado vira uma tarefa `extract_asset` no worker, que guarda o texto extraído junto do item:

| Tipo | Como extrai |
|---|---|
| Link de site | Playwright abre a página e pega o texto visível, o título e as imagens principais |
| Link do Instagram | Apify, como a captação faz hoje: bio, link da bio e legendas dos últimos posts |
| PDF | Texto do arquivo |
| Imagem | Guardada como foto do negócio. Sem leitura de texto na v2 |
| Texto | Usado como foi digitado |

O status de cada item aparece na tela (extraindo, pronto ou erro, com "Tentar de novo"). Um erro não impede gerar o material: o item com erro fica de fora.

A geração da página (spec de Material) só começa quando nenhum item do lead estiver extraindo.

## 5. Dados

### Tabela `lead_assets`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | |
| `lead_id` | uuid | Apaga junto com o lead |
| `kind` | `link`, `arquivo`, `texto` | |
| `label` | text | Opcional |
| `url` | text | Para `link` |
| `storage_path` | text | Para `arquivo`, no bucket `lead-assets` |
| `mime_type` | text | Para `arquivo` |
| `body` | text | Para `texto` |
| `extracted_text` | text | Resultado da extração, até 20 mil caracteres |
| `extracted_images` | text[] | URLs no Storage |
| `status` | `extraindo`, `pronto`, `erro` | `texto` já nasce `pronto` |
| `error` | text | |
| `created_at` | timestamptz | |

### Estados

`revisar` → `completar` → `gerando_material`. `completar` aceita `descartado` e `nao_contatar`. A função `canTransition` ganha esses caminhos, e `PROCESS_STEPS` passa a ser Leads, Completar e Material.

### Retenção

Os arquivos de um lead descartado ou sem resposta seguem a regra de 180 dias da spec anterior e são apagados do Storage junto com os dados.

## 6. Erros

- **Link fora do ar ou bloqueado:** o item fica com erro e a mensagem do site. O Gabriel pode remover ou tentar de novo.
- **Arquivo grande demais ou tipo não aceito:** recusado na hora, sem upload.
- **Mac desligado:** os itens ficam em `extraindo`, e "Gerar material" espera. A tela avisa que o worker está parado quando a tarefa mais antiga tiver mais de 2 minutos.

## 7. Testes

- Transições `revisar` → `completar` → `gerando_material` e as saídas.
- Motivo obrigatório só no fluxo melhorar site.
- A geração espera os itens em extração.
- Extração de texto de um HTML e de um PDF de exemplo.
- Manual: avançar 3 leads, completar um com link, arquivo e texto, pular um e descartar outro.

## 8. Arquivos principais

- `apps/web/src/app/painel/batches/[id]/revisar/page.tsx`: vira a lista nova. A rota pode continuar `revisar`, com o rótulo "Leads".
- `apps/web/src/app/painel/batches/[id]/completar/page.tsx`: novo.
- `apps/web/src/components/leads/lead-drawer.tsx` e `bulk-bar.tsx`: novos.
- `packages/domain/src/stages.ts`, `packages/db/src/lead-assets.ts`, `apps/worker/src/jobs/extract-asset.ts`.
