# Prospecção com o Instagram no centro

**Data:** 2026-11-22 · **Status:** aprovado pelo Gabriel; etapas 1 a 7 feitas em 2026-11-22 (migrações 0023 e 0024) · Visual: artifact "Prospecção pelo Instagram"

## Por quê

Hoje o lead nasce do Google Maps e a chave dele é o `place_id` (único por workspace). Cada lead tem um `batch_id`
só: quando reaparece num batch novo, `importLeads` atualiza nota e fotos e ele continua no batch antigo, invisível
no novo. O Instagram é a melhor fonte para achar o negócio (bio com site, telefone, e-mail, endereço; posts mostram
se está ativo), mas hoje só entra quando vem no link do Maps ou do site.

## Objetivos

- O lead é uma entidade própria, alimentada por fontes: Instagram (principal), Google Maps, busca no Google, site.
- Cada batch cruza o que achou com os leads do workspace e completa os dados em vez de duplicar.
- Nova fonte: busca avançada no Google que traz só perfis do Instagram, montada a partir do nicho e da localização.
- O nicho digitado de forma simples ("lente dental") vira uma busca com todas as variações que os negócios usam.
- Critérios de qualificação marcados à mão no batch.

## Fora do escopo

- Busca por embeddings/vetores (ver "Variações do nicho": começa com trigram).
- Cruzar leads entre workspaces. A unificação vale dentro do workspace; `do_not_contact` continua global.

## Decisões do Gabriel (2026-11-22)

1. **Busca no Google pelo Instagram:** é o tipo de busca que ele já faz à mão, por exemplo

   ```
   site:instagram.com ("lentes de contato dental" OR "lentes dentais" OR "facetas") ("são josé dos campos" OR "sjc") -inurl:/p/ -inurl:/reel/ -inurl:/explore/
   ```

   Só perfis: fora posts, reels e explorar. O app gera essa busca a partir do que ele digita.
2. **Lead já conhecido num batch novo:** não cria outro lead. O lead passa a aparecer também no batch novo, **na
   mesma etapa em que está**, com a marca "já conhecido" e o batch (ou batches) onde foi encontrado antes. É o mesmo
   lead: mudar a etapa num batch muda em todos.
3. **Quem não passa nos critérios:** vai para descartado (`stage = 'descartado'`, `exit_reason` com o critério que falhou).
4. **Fonte do batch:** o Gabriel escolhe; Instagram por padrão. Depois dá para rodar o Google Maps em cima do mesmo
   batch: os lugares do Maps cruzam com os leads do Instagram, completam os que já existem e entram os novos. Um batch
   tem, então, uma ou mais buscas (Instagram, Maps), cada uma com sua execução no Apify.

## Modelo de dados (migrações só acrescentam)

- **Feito (0023):** `leads.instagram_handle` e `leads.site_domain`, calculadas pelo banco a cada gravação
  (`lead_instagram_handle`, `lead_site_domain`; as mesmas regras em `packages/domain/src/lead-keys.ts`, comparadas
  em teste), com índices por workspace junto com `phone_e164`. `batch_leads` (`batch_id`, `lead_id`, `found_at`,
  `already_known`), preenchida com os leads atuais e gravada pela importação. `leads.place_id` opcional.
- **Etapa 3:** o quadro do batch passa a listar por `batch_leads`, em vez de `leads.batch_id`. `leads.batch_id` fica
  como "batch de origem" até nada usar; depois sai, numa migração separada. Antes, repetir o preenchimento da
  `batch_leads` (`on conflict do nothing`) para os batches rodados entre a 0023 e o código novo no ar.
- **Etapa 5:** buscas do batch (`batch_runs`: fonte, termos, execução no Apify, situação), no lugar de
  `batches.apify_run_id` e `instagram_run_id`. Dados brutos de cada fonte (`lead_sources.raw`) entram aqui também,
  se fizerem falta para ver de onde veio cada informação.
- `search_terms` (ver abaixo), na etapa 4.

## Unificação

Normalização (funções puras em `packages/domain`, com testes):

- **@ do Instagram:** de `instagram.com/Clinica.Sorriso/?hl=pt` para `clinica.sorriso` (minúsculas, sem `@`, barra, query).
- **Telefone:** E.164 (já existe).
- **Domínio:** sem `www`, sem caminho. Ignora domínios compartilhados (linktree, wa.me, bio.link, sites de agendamento,
  doctoralia etc.).

Comparação:

- **Chave forte** (@, telefone, place_id, domínio) igual a de um lead existente → junta automaticamente.
  Telefone repetido em vários leads (central, franquia) deixa de valer como chave.
- **Chave fraca** (nome parecido + mesma cidade, por trigram) → só sugere; o Gabriel junta ou separa.
- Ao juntar: campo vazio é preenchido; quando duas fontes discordam vale a mais confiável para o campo (telefone e
  endereço do Maps; link, bio e e-mail do Instagram). `lead_sources.raw` guarda tudo, então dá para ver a origem.

## Variações do nicho e da localização

Na tela do batch, o Gabriel digita algo simples ("lente dental", "SJC").

1. O app procura em `search_terms` (`workspace_id`, `kind` `nicho` | `local`, `label`, `variants text[]`) por
   similaridade de texto (`pg_trgm` + `unaccent`) contra o rótulo e as variações.
2. Se achar, mostra as variações salvas. Se não, pede ao Claude as variações que os negócios usam no Instagram
   ("lentes de contato dental", "lentes dentais", "facetas"…) e, para o local, nome por extenso e apelidos ("são
   josé dos campos", "sjc"), com o município validado pela lista do IBGE que já existe.
3. O Gabriel marca ou tira variações e salva (human in the loop). Da próxima vez sai direto da tabela, sem Claude.

Trigram em vez de vetor: os termos são curtos e o erro típico é de digitação ou acento, que trigram resolve sem
novo provedor (o Claude não gera embeddings). Se aparecerem sinônimos que trigram não pega, a coluna de embedding
entra depois.

## Montagem da busca

```
site:instagram.com (<nicho 1> OR <nicho 2> …) (<local 1> OR <local 2> …) -inurl:/p/ -inurl:/reel/ -inurl:/reels/ -inurl:/explore/ -inurl:/tv/ -inurl:/stories/
```

- Cada variação entre aspas. O Google limita o tamanho da consulta (32 palavras): se passar, divide em várias
  buscas e junta os resultados.
- Roda pelo Apify (`apify/google-search-scraper`, token do workspace), com o número de páginas pela quantidade do batch.
- Filtro depois da busca: só URL com um segmento (`instagram.com/<usuario>/`), fora nomes reservados (`p`, `reel`,
  `explore`, `accounts`, `stories`…).
- Os perfis vão para o `apify/instagram-profile-scraper` (já usado): bio, link externo, telefone e e-mail de conta
  comercial, seguidores, últimos posts. Regex na bio para telefone e e-mail; o link passa pela análise de site atual.

## Critérios do batch

Mantém os números de hoje (avaliações, nota, fotos, dias desde o último post, recontato) e acrescenta marcações:
tem Instagram, postou nos últimos N dias, tem telefone, sem site / com site. Critério de Maps (avaliações, nota) não
vale para lead que veio só do Instagram. Quem falha vai para descartado com o motivo.

## Etapas (todas feitas em 2026-11-22)

1. **Chaves e ligação lead–batch** (0023): `instagram_handle` e `site_domain` calculadas pelo banco, `batch_leads`,
   `place_id` opcional.
2. **Comparação** (`packages/domain/src/lead-match.ts`): `findMatch` por chave forte (place_id, @, domínio, telefone que
   não é de mais de um lead), `keysConflict` (dois place_id ou dois @ diferentes nunca se juntam), `mergeIncoming`,
   `possibleDuplicates` por trigramas no nome sem as palavras genéricas do ramo.
3. **Importação que cruza** (`importLeads`): o lead encontrado de novo ganha o que faltava, fica na etapa dele e entra
   no batch com `already_known`; o quadro e a lista de batches leem `batch_leads`; o card mostra "Já conhecido · batch".
   Um gatilho (0024) liga todo lead novo ao batch de origem. Apagar o batch mantém o lead que está em outro.
4. **Variações** (`search_terms`, 0024): a busca por texto parecido é feita no código (`findSearchTerm`), sem `pg_trgm`.
   Sem termo salvo, o Claude sugere (`SEARCH_VARIANTS_SYSTEM`); o Gabriel marca, tira ou acrescenta e elas ficam salvas.
5. **Fonte Instagram** (`startInstagramSearch` → `handleGoogleResult` → `handleProfilesResult`): `apify/google-search-scraper`,
   só perfis (`handlesFromSearch`), perfis já conhecidos entram direto sem ler de novo, os novos passam pelo
   `apify/instagram-profile-scraper` e viram lead (`mapProfileToLead`: telefone da conta comercial, do wa.me ou da bio;
   e-mail; site; cidade citada na bio). Menu do batch: "Buscar também no Google Maps/Instagram". Webhook `kind=google|profiles`.
   No lugar de `batch_runs`, o batch guarda `google_run_id` e `profiles_run_id` (uma busca por vez no batch).
6. **Critérios marcados** (`requireInstagramActive`, `requirePhone`, `site` no `criteria` do batch): `checkEliminatory`
   descarta com o motivo. Os números de antes seguem só como pontuação.
7. **Várias cidades** (`batches.locations`; no Maps, uma busca por cidade) e **possíveis duplicados**
   (`/painel/batches/duplicados`, juntar com `mergeLeads` ou separar com `lead_duplicate_dismissals`). Juntar não vale
   para dois leads com conversa ou cliente. `do_not_contact` aceita o @ do Instagram.

8. **Raio e mapa** (2026-11-22): `municipios-data.ts` ganhou latitude e longitude (base kelvins/municipios-brasileiros,
   pelo código do IBGE). No batch novo, a primeira cidade é o centro e o raio (15, 30, 50, 80 km) acrescenta as vizinhas
   (`municipiosNear`), que dá para tirar uma a uma. O mapa (Leaflet, OpenStreetMap escurecido por CSS) mostra o raio, as cidades
   escolhidas e onde o nicho digitado já foi buscado. Batches › Mapa mostra todas as cidades prospectadas, com filtro
   por nicho (`prospectedCities`).

## Em aberto

- Nada por enquanto.
