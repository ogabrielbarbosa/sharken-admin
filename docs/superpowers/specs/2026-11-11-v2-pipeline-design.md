# Versão 2: Pipeline do batch

**Data:** 2026-11-11
**Status:** formato, etapas e limpeza aprovados pelo Gabriel em 2026-11-11. Aguarda a revisão desta spec.
**Visão geral:** `2026-11-11-v2-visao-geral-design.md`

Esta spec substitui, onde as duas falam do mesmo assunto, a spec de Leads (`2026-11-11-v2-leads-design.md`, seções 2.Avançar e 3) e toda a spec de Material (`2026-11-11-v2-material-design.md`). Também muda a visão geral nas seções 2, 3, 5 e 7.

## 1. Por que mudar

Hoje o batch tem três abas (Leads, Completar e Material), cada uma com uma tela própria, e o sistema gera a página com um agente e recebe o vídeo por upload. O Gabriel quer:

- ver todos os leads do batch em **uma pipeline**, cada um na etapa em que está;
- fazer a **página e o vídeo à mão**, porque fica melhor, e só anexar os links ao lead;
- que o sistema se limite a **juntar e analisar as informações do negócio** (dados, fotos, links, arquivos).

## 2. Etapas

```
Novo lead → Qualificado → Página → Vídeo → Pronto para abordar ──► CRM
     └──────────────┴─────────┴───────┴──► Descartados
```

Todas as etapas são obrigatórias e seguem nessa ordem. O lead anda por botões, sem arrastar, para não pular etapa.

| Coluna | `leads.stage` | Cartão mostra | Clicar abre | Avança com |
|---|---|---|---|---|
| **Novo lead** | `analisando`, `revisar` | Nome, situação do site, nota, pontuação. `analisando` aparece com "Analisando…" e sem botões | Painel lateral de hoje (`lead-drawer`): critérios, sinais do site, resumo, motivo, comentário | ✓ **Qualificar** → Qualificado. ✕ **Descartar** |
| **Qualificado** | `completar` | O que foi acrescentado ("2 links · 1 PDF · 4 fotos") e itens em extração | **Modal de completar** (seção 3) | **Informações completas** → Página |
| **Página** | `pagina` (novo) | "Falta a página" ou o domínio do link | Modal com o campo **Link da página** | Salvar um link válido → Vídeo |
| **Vídeo** | `video` (novo) | "Falta o Loom" | Modal com o campo **Link do Loom** | Salvar um link válido → Pronto para abordar |
| **Pronto para abordar** | `crm`, `vendido`, `sem_interesse` | Status do contato no CRM (Novo, Contatado, Em conversa…) | A conversa do contato em `/painel/crm` | O resto acontece no CRM |
| **Descartados** | `descartado`, `nao_contatar` | Recolhida no fim do quadro, só com a contagem. Expande ao clicar | Painel lateral | — |

### Voltar uma etapa

Os modais de Página e Vídeo têm **Voltar** para a etapa anterior, para corrigir algo antes de abordar. A partir de Pronto para abordar, o lead não volta: o contato já existe. Para trocar os links depois disso, use o painel do contato no CRM (seção 5).

### Quadro

- Uma coluna por etapa, cada uma com a contagem no título. Cada coluna rola sozinha.
- Cartões de Novo lead ordenados por pontuação. Nas outras colunas, pela data em que o lead entrou na etapa (`stage_changed_at`, coluna nova, o mais antigo primeiro).
- Os filtros de hoje (`review-filters.tsx`, `review-filter.ts`) ficam numa barra acima do quadro e filtram só a coluna Novo lead.
- Os cartões de Novo lead têm caixa de seleção. Com algum selecionado, a barra de rodapé (`bulk-bar.tsx`) mostra "3 selecionados · Descartar · Qualificar". "Selecionar todos" pega só os visíveis no filtro.
- O bloco "Buscando no Google Maps / Analisando" continua no topo enquanto o batch roda.
- No celular, as colunas viram abas com a contagem, uma coluna por vez.

## 3. Modal de completar (Qualificado)

O conteúdo da tela Completar de hoje passa para um modal. A lógica e as ações dela (`completar/actions.ts`) continuam.

- **Esquerda, o que o sistema já tem:** nome, telefone, endereço, categorias, nota, avaliações, site, Instagram e as **fotos** encontradas (as do Google Maps e as extraídas dos itens).
- **Direita, o que o Gabriel acrescenta:** links, arquivos, texto, motivo (só no fluxo melhorar site) e comentário. Salva ao sair do campo, como hoje.
- **Extração:** igual à spec de Leads, seção 4 (`extract_asset`: Playwright para sites, Apify para Instagram, texto de PDF, imagens viram fotos). O status de cada item aparece no modal.
- **Copiar briefing:** um botão que copia para a área de transferência, em Markdown, tudo o que se sabe do negócio: dados, motivo, textos extraídos, links e URLs das fotos. Serve para o Gabriel colar no Claude Desktop, ou onde for montar a página.
- **Informações completas:** só fica ativo quando nenhum item está extraindo e, no fluxo melhorar site, o motivo está preenchido. Leva o lead para `pagina` e fecha o modal.
- **Setas** no topo do modal passam para o lead anterior ou o próximo da coluna Qualificado.

## 4. Links da página e do Loom

| Campo | Validação | Onde fica |
|---|---|---|
| Link da página | URL `https://` válida, de qualquer domínio | `leads.page_url` |
| Link do Loom | `https://www.loom.com/share/<id>` ou `https://loom.com/share/<id>`, com ou sem parâmetros | `leads.loom_url` |

A validação fica no domínio (`packages/domain/src/pipeline-links.ts`), com testes. Os links ficam no lead e o contato os lê por `contacts.lead_id`, então lead e contato são o mesmo registro visto de dois lados, e nada é digitado duas vezes.

## 5. Pronto para abordar e o CRM

- Salvar o link do Loom leva o lead para `crm` e cria o contato com status `novo`, usando a função que hoje roda ao aprovar o material. Isso inclui a regra do telefone único: se o número já é contato, o lead é ligado a ele.
- O painel do contato no CRM mostra **Página** e **Loom**, cada um com o link e os botões abrir e copiar, e com **Editar** para trocar o link (grava no lead).
- A mensagem de primeiro contato e a de follow-up preenchem `[link]` com `leads.page_url`. O Loom não entra sozinho em nenhuma mensagem: o Gabriel copia e cola se quiser.
- Somem do CRM a validade da página ("Expira em…", "Renovar por mais 24 h") e o aviso de abertura da página, porque a página não fica mais hospedada pelo sistema.

## 6. Estados (`packages/domain/src/stages.ts`)

`LeadStage` passa a ser:

`analisando` · `revisar` · `completar` · `pagina` · `video` · `crm` · `vendido` · `descartado` · `sem_interesse` · `nao_contatar`

Saem `gerando_material` e `revisar_material`.

```
analisando → revisar → completar → pagina → video → crm → vendido | sem_interesse
                       pagina → completar     (Voltar)
                       video  → pagina        (Voltar)
sem_interesse → crm                           (contato perdido que volta a falar, como hoje)
```

`descartado` vale a partir de qualquer estado que não seja final, e `nao_contatar` vale de qualquer estado, como hoje. `ProcessStep` e `PROCESS_STEPS` são trocados por `PIPELINE_COLUMNS`, com a ordem e o rótulo das colunas e os estados de cada uma, e por `columnOf(stage)`. Os testes cobrem todas as transições, válidas e inválidas.

## 7. Dados

Migração nova `0006_pipeline.sql`, aplicada com `pnpm db:migrate`. Ela não apaga dados.

| Mudança | Detalhe |
|---|---|
| `leads.page_url`, `leads.loom_url` | Novas, `text` nulo |
| `leads.stage_changed_at` | Nova, `timestamptz`. Um trigger a atualiza quando `stage` muda. Os leads existentes começam com `updated_at` |
| `leads.stage` | O check passa a aceitar `pagina` e `video` e deixa de aceitar `gerando_material` e `revisar_material` |
| Leads em `gerando_material` ou `revisar_material` | Vão para `pagina` |
| Leads já em `crm` | Continuam. Sem links, o painel do CRM mostra os campos vazios para preencher |
| `sites`, `videos` | As tabelas e os dados **ficam no banco**, sem uso pelo código. Apagar as tabelas pode ser feito depois, numa migração própria, se o Gabriel pedir |
| `jobs` | Tarefas pendentes `build_page`, `generate_page`, `render_video` e `transcode_video` são marcadas como canceladas |

A seção 6 da visão geral (migração da v1) continua valendo.

## 8. Limpeza

O que deixa de existir no código (o histórico fica no git):

| Área | Sai |
|---|---|
| Worker | `build-page.ts`, `generate-page.ts`, `render-video.ts`, `transcode-video.ts` e os registros deles em `jobs/index.ts`, com os testes |
| Config | `page-design/` (GUIA.md e config), `video.ts`, `scripts.ts` (roteiro do vídeo por IA). Os prompts de página em `prompts.ts`. Envs `PAGE_AGENT_MODEL`, `PAGE_TTL_HOURS`, `PAGES_HOST`, `VIDEO_MODE`, `ELEVENLABS_*` e `PEXELS_API_KEY` |
| Domínio | `page-checks.ts`, `page-copy.ts`, `page-expiry.ts`, `page-readiness.ts`, `page-slug.ts`, `site-content.ts`, `fact-check.ts`, `material.ts`, `script.ts`, `video-timing.ts`, `video-upload.ts`, com os testes |
| Integrações | `page-copy.ts`, `pexels.ts`, `elevenlabs.ts` e as exportações no `index.ts` |
| Banco (código) | `packages/db/src/material.ts` e o trecho de `sites` em `send-message.ts` |
| Web | `app/p/[slug]/` (rota e template), `components/template/`, `app/api/open/`, `lib/page-access.ts`, a reescrita de host em `proxy.ts`, as telas `revisar/`, `completar/` e `material/` do batch, o `Stepper` |
| Retenção | `api/cron/retention` deixa de apagar páginas e vídeos e continua apagando os arquivos de `lead-assets` |

Antes de apagar cada arquivo, o plano confere com `grep` quem ainda o importa. Se algo da lista for usado pela análise do lead (por exemplo `site-content.ts` ou `fact-check.ts`), o arquivo fica.

O que **fica**: busca, análise e pontuação (`analyze-lead.ts`), `download-media.ts`, `extract-asset.ts`, `lead_assets`, filtros, CRM, contrato e pagamento.

## 9. Rotas

- `/painel/batches/[id]` passa a ser a pipeline (`page.tsx` novo). O layout do batch perde o `Stepper` e mantém o topo.
- `revisar`, `completar`, `material`, `abordar`, `aguardar`, `conversa` e `vendido` dentro do batch redirecionam para `/painel/batches/[id]`.
- A tela do lead (`/painel/leads/[id]`) troca os blocos de página e vídeo pelos dois links.
- A lista de Batches passa a contar os leads por coluna da pipeline.

## 10. Erros

- **Link inválido:** o campo mostra o erro e o lead não avança.
- **Item de extração com erro:** como hoje, fica de fora e não trava "Informações completas".
- **Mac desligado:** os itens ficam em extração. O modal avisa quando a tarefa mais antiga passa de 2 minutos, como a tela Completar de hoje.
- **Duas abas abertas:** cada ação confere o estágio atual antes de mudar (`assertTransition`). Se o lead já mudou, o quadro recarrega e mostra o aviso "Este lead já mudou de etapa".

## 11. Testes

- Domínio: transições novas, `columnOf`, validação dos links da página e do Loom, briefing em Markdown a partir de um lead de exemplo.
- Banco: a migração leva `gerando_material` e `revisar_material` para `pagina`. Salvar o Loom cria o contato e liga ao que já existe com o mesmo telefone.
- Envio: `[link]` vem de `leads.page_url`, e o envio deixa de mexer em `sites`.
- Manual: num batch de teste, qualificar 3 leads, completar um com link, PDF e texto, copiar o briefing, colar um link de página e um de Loom, ver o contato em Pronto para abordar e no CRM, e mandar a primeira mensagem com o link certo.

## 12. Telas

Atualizar `untitled.pen` com um frame "v2 · Pipeline" (quadro, modal de completar e modais de Página e Vídeo) e marcar como substituídos os frames de Leads, Completar e Material.
