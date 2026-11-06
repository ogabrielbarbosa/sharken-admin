# Sistema de prospecção de landing pages: design da primeira versão

**Data:** 2026-11-06
**Status:** spec aprovado pelo Gabriel em 2026-11-06

## 1. Objetivo

Encontrar negócios locais que precisam de um site novo e chegar até eles com uma página de exemplo e um vídeo prontos, com pouco esforço operacional.

O sistema cobre a prospecção: da busca até o lead responder e a venda ser registrada. Negociação, proposta, contrato, pagamento e entrega ficam com o Gabriel, fora do sistema.

## 2. Fora desta versão

- Envio de mensagens pela plataforma, inclusive follow-up
- Integração com o WhatsApp e CRM (possível próximo passo, se a abordagem funcionar)
- Proposta, contrato e cobrança
- Formulário de ajustes e publicação da página vendida
- Login para mais de um usuário

## 3. Fluxo

As marcações indicam quem age em cada etapa.

1. **Escolher região e tipo de negócio (Gabriel).** Os dois campos são livres, e os filtros do ICP podem ser ajustados em cada busca.
2. **Buscar e completar dados (sistema).** O Apify busca os negócios no Google Maps, e o sistema completa os dados com o site e o Instagram, quando existirem.
3. **Verificar o site (sistema).** Cada lead segue para um dos caminhos da seção 4.
4. **Avaliar o site (Gabriel).** Só para quem tem site funcionando: o site está ruim ou está bom?
5. **Pontuar pelo ICP (sistema).** Filtros eliminatórios e pontuação, com a justificativa visível.
6. **Aprovar a lista (Gabriel).** Aprovar ou reprovar, individualmente ou em lote.
7. **Montar página e vídeo (sistema).** O conteúdo segue o fluxo do lead.
8. **Conferir o material (Gabriel).** Aprovar ou pedir para refazer. Só o que for aprovado segue.
9. **Primeiro contato (Gabriel, com texto preparado pelo sistema).** O app abre a conversa com a mensagem pronta, e o Gabriel aperta enviar e confirma o envio no painel.
10. **Follow-up (Gabriel, com texto preparado pelo sistema).** Oferecido 3 dias depois, se não houver resposta.
11. **Conversa (Gabriel, com sugestões do sistema).** A IA sugere respostas. O Gabriel conduz a venda e registra o resultado.

### Etapas do lead

`encontrado` → `site_verificado` → (`site_em_avaliacao`, só para quem tem site funcionando) → `pontuado` → `aprovado` → `material_gerado` → `material_aprovado` → `contatado` → `follow_up_feito` → `respondeu` → `vendido`

Estados de saída, possíveis em qualquer etapa: `site_ok`, `reprovado`, `sem_interesse` e `nao_contatar`.

## 4. Verificação do site e os dois fluxos

| Situação encontrada | Como é identificada | Resultado |
|---|---|---|
| Sem site | Nenhum link no cadastro, ou só rede social ou agregador de links | Fluxo **sem site** |
| Site fora do ar | Erro de DNS ou de servidor, ou tempo esgotado, em 3 tentativas separadas | Fluxo **sem site**, marcado como `site_fora_do_ar` |
| Site funcionando | A página carrega | Vai para avaliação do Gabriel |

### Avaliação do site

A tela mostra capturas do site no computador e no celular, o tempo de carregamento e se há HTTPS. O sistema não dá a nota: o Gabriel decide.

- **Site ruim:** o lead entra no fluxo **melhorar site**, e o Gabriel marca um ou mais motivos em uma lista editável (por exemplo: não funciona bem no celular, visual antigo, lento, sem botão de WhatsApp).
- **Site bom:** o lead sai da lista como `site_ok`.

### O que muda em cada fluxo

| | Sem site | Melhorar site |
|---|---|---|
| **Argumento** | O negócio não tem um site funcionando | Os motivos marcados pelo Gabriel |
| **Dados da página** | Google Maps e Instagram | Também textos, fotos, logo e cores do site atual |
| **Vídeo** | Apresenta a página de exemplo | Mostra o site atual e depois a página de exemplo |
| **Mensagem e roteiro** | Próprios (variação para site fora do ar) | Próprios, usando os motivos marcados |

## 5. Filtros do ICP

Os filtros são um ponto de partida, editáveis em cada busca. Os valores usados ficam salvos na busca.

**Filtros eliminatórios:**

- Tem telefone celular no cadastro
- Negócio aberto
- Não está em `nao_contatar`
- Não recebeu contato nos últimos 180 dias

**Pontuação (0 a 100):**

| Critério | Pontos |
|---|---|
| 20 avaliações ou mais no Google | 25 |
| Nota 4,0 ou maior | 20 |
| 3 fotos utilizáveis ou mais | 20 |
| Instagram ativo nos últimos 90 dias | 20 |
| Descrição ou lista de serviços disponível | 15 |

A pontuação usa regras fixas, sem IA. Leads com menos de 50 pontos ficam no fim da lista, sem serem eliminados.

## 6. Página de exemplo

- **Template:** um único template, definido em código, que se adapta a qualquer tipo de negócio, com cores derivadas da marca quando for possível identificá-las.
- **Seções:** apresentação, serviços, fotos, avaliações, localização e contato.
- **Textos da IA:** usam só os dados encontrados. Fatos como preços, certificações e anos de experiência nunca são inventados.
- **Campo sem dado:** a seção opcional some. Sem nome, telefone, endereço ou pelo menos um serviço, o lead vai para revisão.
- **Fotos:** vêm de canais do próprio negócio. Sem fotos suficientes, o template usa imagens de banco licenciadas, sem apresentá-las como sendo do local.
- **Vídeo:** fica no topo da página. A mensagem leva um único link, porque o link `wa.me` só preenche texto.
- **Proteção:** a página fica com `noindex`, em URL difícil de adivinhar, e com o aviso "Modelo preparado por [nome comercial]. Ainda não publicado".
- **Validade:** o modelo expira em 30 dias e é removido imediatamente se o negócio pedir.

## 7. Módulo de vídeo

O vídeo é um módulo próprio, que o Gabriel e o sistema vão afinando. Não há número mínimo de vídeos de teste nem etapa de aprovação do módulo: o Gabriel libera quando o resultado estiver bom.

- **Duração:** 60 a 90 segundos.
- **Imagem:** gravação automática da rolagem da página do lead, com nome e dados na tela. No fluxo melhorar site, mostra antes o site atual.
- **Roteiro:** um por fluxo, com campos variáveis, editável sem mexer no código.
- **Voz:** narração gravada pelo Gabriel, com clone da voz dele nos campos variáveis. Se as emendas ficarem perceptíveis, a narração inteira pode passar a usar a voz clonada.
- **Montagem:** Remotion, renderizando no Mac do Gabriel por uma fila de tarefas.
- **Transparência:** o vídeo diz que o modelo foi preparado para aquele negócio e não afirma que foi gravado pessoalmente para ele.

### Primeira versão dos roteiros

Estes textos existem para começar a afinar, não são a versão final.

**Sem site:**

> Oi, pessoal da [nome do negócio]! Aqui é o Gabriel, eu faço sites para negócios locais aqui em [cidade]. Procurei vocês no Google, vi as avaliações e não encontrei um site funcionando. Quem procura por [tipo de negócio] na região acaba decidindo só pelo que aparece ali. Então preparei um modelo com os dados públicos de vocês. Olha como fica: logo de cara, quem entra vê o que vocês fazem e chama no WhatsApp com um toque. Depois vêm os serviços, as fotos, as avaliações e como chegar. Ele ainda não está publicado e pode ser ajustado com as informações certas. Se fizer sentido, é só me responder por aqui. Se não fizer, é só avisar, que eu não mando mais mensagem.

**Melhorar site:**

> Oi, pessoal da [nome do negócio]! Aqui é o Gabriel, eu faço sites para negócios locais aqui em [cidade]. Dei uma olhada no site de vocês e vi um ponto que pode estar custando clientes: [motivo]. Então preparei um modelo novo com as informações públicas de vocês. Olha a diferença: logo de cara, quem entra vê o que vocês fazem e chama no WhatsApp com um toque, inclusive pelo celular. Depois vêm os serviços, as fotos, as avaliações e como chegar. Ele ainda não está publicado e pode ser ajustado com as informações certas. Se fizer sentido, é só me responder por aqui. Se não fizer, é só avisar, que eu não mando mais mensagem.

## 8. WhatsApp e contato

### Regras do sistema

- O app não envia mensagens. Ele só abre a conversa com o texto preenchido, por link `wa.me`.
- Não há disparo em massa, automação de cliques, rotação de números ou variações de texto para evitar detecção.
- O limite é um contato inicial e um follow-up por lead.
- Um pedido para parar coloca o lead em `nao_contatar` de forma permanente.

### Operação

- O Gabriel usa um número dedicado, separado do pessoal.
- O volume começa em 20 contatos por dia. Ele só aumenta depois de uma semana sem restrição do WhatsApp e sem denúncias perceptíveis.
- Se o número for restringido, os envios param, e o canal é reavaliado. Criar outra conta para contornar um bloqueio está fora de cogitação.

### Primeira mensagem (modelos iniciais)

**Sem site:**

> Oi, [nome do negócio]! Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Vi que vocês ainda não têm site e preparei um modelo com os dados públicos de vocês. Dá uma olhada: [link]. Se não fizer sentido ou preferir não receber mais mensagens, é só me avisar.

**Sem site, com site fora do ar:**

> Oi, [nome do negócio]! Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Tentei abrir o site de vocês e não consegui, então preparei um modelo com os dados públicos de vocês. Dá uma olhada: [link]. Se não fizer sentido ou preferir não receber mais mensagens, é só me avisar.

**Melhorar site:**

> Oi, [nome do negócio]! Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Vi o site de vocês e notei um ponto que pode melhorar: [motivo]. Preparei um modelo novo com os dados públicos de vocês. Dá uma olhada: [link]. Se não fizer sentido ou preferir não receber mais mensagens, é só me avisar.

### Risco conhecido

A política do WhatsApp Business exige permissão para mensagens de empresa, e os termos do WhatsApp restringem usos não pessoais não autorizados. O envio manual reduz o risco de automação, mas não torna o contato frio plenamente conforme. A restrição do número é um risco aceito pelo Gabriel e deve ser acompanhada.

## 9. Dados e LGPD

- **Coleta:** só o necessário para abordar o negócio, a partir de fontes públicas.
- **Base legal pretendida:** legítimo interesse, com a análise registrada antes do primeiro contato.
- **Transparência:** cada contato diz quem é o remetente, de onde vieram os dados e como sair da lista.
- **Retenção:** leads sem resposta têm os dados removidos em 180 dias, restando só o necessário para não contatá-los de novo.
- **Revisão jurídica:** consultar um advogado antes de ultrapassar 500 contatos.

## 10. Arquitetura

Um único repositório, com o app e o worker.

| Parte | Tecnologia | Função |
|---|---|---|
| Painel e páginas de exemplo | Next.js na Vercel | Telas de operação e modelos |
| Dados e arquivos | Supabase | Banco, login do Gabriel, fotos, capturas e vídeos |
| Captação | Apify | Busca no Google Maps e dados públicos, com retorno por webhook |
| Textos | API do Claude | Textos da página, mensagens e sugestões de resposta |
| Voz | ElevenLabs | Campos variáveis do roteiro |
| Worker local | Node, Playwright e Remotion no Mac | Verifica e captura sites, grava a página e renderiza o vídeo |

O app e o worker se comunicam por uma tabela de tarefas no Supabase. Se o Mac estiver desligado, as tarefas ficam na fila e continuam quando ele voltar.

### Unidades

- **Captação:** recebe região e tipo de negócio e devolve leads normalizados e sem duplicatas.
- **Verificação de site:** recebe um lead e devolve a situação do site, as capturas e as medições.
- **ICP:** recebe um lead e os filtros e devolve pontuação e justificativa.
- **Geração de página:** recebe o lead e o fluxo e devolve uma página de exemplo.
- **Geração de vídeo:** recebe a URL da página, o roteiro e os dados do lead e devolve um MP4.
- **Contato:** gera a mensagem, abre a conversa, registra eventos e controla follow-ups e `nao_contatar`.
- **Painel:** mostra as filas e registra as decisões. Não contém regra de negócio.

### Tabelas principais

- `searches`: região, tipo de negócio e filtros usados
- `leads`: dados do negócio, origem, situação do site, fluxo, motivos, pontuação e etapa
- `sites`: conteúdo gerado, URL, validade e status
- `videos`: status, arquivo e erro
- `scripts`: roteiros e mensagens por fluxo
- `jobs`: fila de tarefas do worker
- `events`: histórico de contatos, aberturas de link, respostas e decisões
- `do_not_contact`: telefones e negócios que não podem ser contatados

## 11. Telas do painel

1. **Nova busca:** região, tipo de negócio e filtros.
2. **Avaliação de sites:** capturas e medições, com site ruim e motivos, ou site bom.
3. **Lista de leads:** fluxo, pontuação, justificativa, aprovação individual e em lote.
4. **Revisão do material:** prévia da página e do vídeo, com aprovar ou refazer.
5. **Roteiros:** edição dos roteiros e das mensagens por fluxo.
6. **Fila de contato:** próximo lead, mensagem editável, botão "Abrir no WhatsApp", confirmação de envio e follow-ups vencidos.
7. **Conversas:** leads que responderam, sugestão de resposta e ações "vendido", "sem interesse" e "não contatar".
8. **Resultados:** contatos, aberturas, respostas e vendas, por fluxo e por tipo de negócio.

## 12. Erros

- **Busca incompleta:** salva o que veio, mostra o erro e permite repetir sem duplicar leads.
- **Site instável:** o lead só é tratado como fora do ar depois das 3 tentativas.
- **Dados insuficientes:** o lead vai para revisão, e a página não é gerada.
- **Falha da IA ou da voz:** até 3 tentativas. Depois, o lead fica marcado com erro, sem travar o lote.
- **Mac desligado:** as tarefas ficam na fila e continuam quando o worker voltar.
- **Número inválido:** o Gabriel marca o lead como inválido na fila de contato.
- **Confirmação de envio:** como o envio ocorre fora do app, o Gabriel confirma cada um. Sem confirmação, o lead não muda de etapa.

## 13. Testes

- **Automatizados:** normalização, deduplicação, classificação do site, regras do ICP, transições de etapa, bloqueio de `nao_contatar` e limite de follow-up.
- **Conteúdo:** um conjunto de leads de exemplo, nos dois fluxos e com dados faltantes, para garantir que nenhum fato seja inventado e que nenhuma página quebre.
- **Manual antes do primeiro contato:** um lead fictício de cada fluxo percorre todo o caminho, com a página aberta no celular.

## 14. Ordem de construção

1. **Captação:** busca, enriquecimento, verificação de site e avaliação.
2. **ICP e lista:** filtros, pontuação e aprovação.
3. **Página:** template e geração nos dois fluxos.
4. **Contato:** fila, follow-up, `nao_contatar` e registro de eventos.
5. **Vídeo:** módulo com roteiros, voz e renderização, afinado com as gravações do Gabriel.
6. **Conversas e resultados:** sugestões de resposta, registro de venda e números.

O prazo de um dia é uma expectativa, não um requisito.

## 15. Em aberto

1. Nome comercial usado no aviso dos modelos e nas mensagens
