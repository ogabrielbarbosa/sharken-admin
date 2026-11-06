# Sistema de prospecção de landing pages: design da primeira versão

**Data:** 2026-11-06
**Status:** telas aprovadas pelo Gabriel em 2026-11-06. Esta versão substitui a anterior e aguarda a revisão dele.
**Telas:** `untitled.pen`, na raiz do projeto. Elas são a referência visual e de conteúdo.

## 1. Objetivo

Encontrar negócios locais que precisam de um site novo, chegar até eles com uma página de exemplo e um vídeo prontos e, depois da venda, controlar o cliente, os serviços, os contratos e as cobranças.

O sistema atende um único usuário, o Gabriel. Ele aprova cada etapa e envia cada mensagem de WhatsApp.

## 2. Fora desta versão

- Envio de mensagens de WhatsApp pela plataforma, inclusive follow-up
- CRM conectado ao WhatsApp (possível próximo passo)
- Tela para editar roteiros, mensagens e gravações
- Publicação da página vendida e formulário de ajustes
- Editor de página para o cliente e login para mais de um usuário

## 3. Processo

O **batch** é a unidade de trabalho: uma busca por localização e tipo de negócio. O Gabriel abre um batch e leva os leads dele por esta sequência:

**Revisar → Material → Abordar → Aguardar → Conversa → Vendido**

| Etapa | Quem age | O que acontece |
|---|---|---|
| **Novo batch** | Gabriel | Drawer em 3 passos: onde buscar, critérios e confirmação |
| **Busca e análise** | Sistema | Puxa os leads, faz o scraping dos dados e do site e gera a análise |
| **Revisar** | Gabriel | Abre o site em outra aba, lê a análise e avança ou descarta, um a um ou em lote |
| **Material** | Sistema e Gabriel | O sistema gera página e vídeo. O Gabriel aprova ou pede para refazer |
| **Abordar** | Gabriel | Um lead por vez: abre o WhatsApp com a mensagem pronta, envia e confirma |
| **Aguardar** | Sistema e Gabriel | O follow-up vence 3 dias depois do envio, sem resposta. O Gabriel envia uma vez e confirma |
| **Conversa** | Gabriel | Cola a mensagem recebida, pede uma sugestão da IA e registra o resultado |
| **Vendido** | Gabriel | Fim do processo. O Gabriel cadastra o cliente |

Em qualquer etapa, o lead pode ser descartado ou marcado como "Não contatar".

### Estados do lead

`analisando` → `revisar` → `gerando_material` → `revisar_material` → `abordar` → `aguardando` → `follow_up_feito` → `conversa` → `vendido`

Um lead em `aguardando` também pode ir direto para `conversa`. Refazer o material volta o lead de `revisar_material` para `gerando_material`.

Estados de saída: `descartado`, `sem_interesse` e `nao_contatar`.

## 4. Busca e análise

Cada batch recebe localização, tipo de negócio, quantidade (padrão: 50) e critérios.

### Situação do site e fluxo

| Situação | Como é identificada | Fluxo |
|---|---|---|
| Sem site | Nenhum link no cadastro, ou só rede social ou agregador de links | Sem site |
| Fora do ar | Erro de DNS, conexão ou certificado, 20 s sem resposta, 404, 410 ou status 500+, em 3 tentativas com 5 minutos entre elas | Sem site, com mensagem própria |
| Funcionando | Qualquer outro resultado, inclusive 403, que costuma ser bloqueio de robô | Melhorar site |

Se o site "funcionando" for um domínio à venda ou uma página em construção, o Gabriel descarta o lead em Revisar.

### Análise

- **Pontuação do ICP:** regras fixas, sem IA, com os critérios atendidos e não atendidos.
- **Sinais do site:** tempo de carregamento, HTTPS, adaptação ao celular e botão de WhatsApp.
- **Resumo:** até três linhas escritas pela IA, usando só os dados encontrados.
- **Motivo sugerido:** só para lead com site funcionando. É o ponto a citar para o lead, na mensagem e no vídeo.

### Critérios

Os valores são padrões, editáveis em cada batch.

**Filtros eliminatórios.** Quem não passa fica fora de Revisar, com o motivo registrado:

- Tem telefone celular no cadastro
- Negócio aberto
- Não está em `nao_contatar`
- Não recebeu contato nos últimos 180 dias

**Pontuação (0 a 100):**

| Critério | Pontos |
|---|---|
| 20 avaliações ou mais no Google | 25 |
| Nota 4,0 ou maior | 20 |
| 3 fotos ou mais | 20 |
| Instagram ativo nos últimos 90 dias | 20 |
| Descrição ou lista de serviços disponível | 15 |

Revisar ordena por maior pontuação, sem eliminar quem pontuou pouco.

### Comentário e motivo

- **Comentário:** anotação interna, nunca aparece para o lead.
- **Motivo:** campo próprio em Revisar, só para lead com site funcionando. Vem preenchido pela análise, é editável e obrigatório para avançar. Preenche o `[motivo]` da mensagem e do vídeo.
- **Sem site e fora do ar:** usam texto fixo, sem esse campo.

## 5. Página de exemplo

A página não tem desenho no arquivo de telas: ela é gerada por um template em código.

- **Template:** único, adaptável a qualquer tipo de negócio, com cores da marca quando for possível identificá-las.
- **Seções:** vídeo, apresentação, serviços, fotos, avaliações, localização e contato.
- **Textos da IA:** usam só os dados encontrados. Preços, certificações e anos de experiência nunca são inventados.
- **Campo sem dado:** a seção opcional some. Sem nome, telefone, endereço ou pelo menos um serviço, o lead fica marcado para resolução em Material.
- **Serviços:** a categoria do Google Maps conta como serviço. A IA não acrescenta serviços que não estejam nos dados.
- **Fotos:** vêm de canais do negócio. Com menos de 3, o template completa com imagens licenciadas e a legenda "Imagem ilustrativa".
- **Avaliações:** estrelas e texto, sem o nome do autor.
- **Melhorar site:** também usa textos, fotos, logo e cores do site atual.
- **Proteção:** `noindex`, URL difícil de adivinhar (`/p/<código>`) e o aviso "Modelo preparado por [nome comercial]. Ainda não publicado".
- **Validade:** expira em 30 dias e pode ser removida na hora, pela tela Lead. Depois disso, mostra uma mensagem neutra.

## 6. Vídeo

O vídeo é gerado por um worker, com a configuração definida no projeto.

- **Duração:** 60 a 90 segundos. Fora disso, aparece um alerta em Material, sem bloquear.
- **Imagem:** gravação automática da rolagem da página. No fluxo melhorar site, mostra antes o site atual.
- **Roteiro:** um por fluxo, com os campos `[nome do negócio]`, `[cidade]`, `[tipo de negócio]` e `[motivo]`.
- **Voz:** narração gravada pelo Gabriel, com clone da voz dele nos campos variáveis, pelo ElevenLabs ou plataforma semelhante. A configuração também permite usar a voz clonada no vídeo inteiro.
- **Montagem:** Remotion, no Mac do Gabriel.
- **Entrega:** só dentro da página. A mensagem leva um único link.
- **Transparência:** o vídeo diz que o modelo foi preparado para aquele negócio e não afirma que foi gravado pessoalmente para ele.
- **Afinação:** o Gabriel libera o vídeo quando o resultado estiver bom. Desligado, o material fica pronto só com a página.

Roteiros, mensagens, gravações e prompts ficam em arquivos de configuração no projeto, como um system prompt. Mudá-los é uma alteração no projeto.

### Primeira versão dos roteiros

**Sem site:**

> Oi, pessoal da [nome do negócio]! Aqui é o Gabriel, eu faço sites para negócios locais aqui em [cidade]. Procurei negócios de [tipo de negócio] na região, vi as avaliações de vocês e não encontrei um site funcionando. Então preparei um modelo com os dados públicos de vocês. Olha como fica: logo de cara, quem entra vê o que vocês fazem e chama no WhatsApp com um toque. Depois vêm os serviços, as fotos, as avaliações e como chegar. Ele ainda não está publicado e pode ser ajustado com as informações certas. Se fizer sentido, é só me responder por aqui. Se não fizer, é só avisar, que eu não mando mais mensagem.

**Melhorar site:**

> Oi, pessoal da [nome do negócio]! Aqui é o Gabriel, eu faço sites para negócios locais aqui em [cidade]. Dei uma olhada no site de vocês e vi um ponto que pode melhorar: [motivo]. Então preparei um modelo novo com as informações públicas de vocês. Logo de cara, quem entra vê o que vocês fazem e chama no WhatsApp com um toque. Depois vêm os serviços, as fotos, as avaliações e como chegar. Ele ainda não está publicado e pode ser ajustado com as informações certas. Se fizer sentido, é só me responder por aqui. Se não fizer, é só avisar, que eu não mando mais mensagem.

## 7. WhatsApp e contato

### Regras

- O app não envia mensagens de WhatsApp. Ele só abre a conversa com o texto preenchido, por link `wa.me`.
- Não há disparo em massa, automação de cliques, rotação de números ou variações de texto para evitar detecção.
- O limite é um contato inicial e um follow-up por lead.
- Sem a confirmação do Gabriel, o lead não muda de etapa.
- Um pedido para parar coloca o telefone e o negócio em `nao_contatar` de forma permanente.

### Operação

- O Gabriel usa um número dedicado, separado do pessoal.
- "Envios hoje" conta todos os batches. O volume começa em 20 contatos por dia, e passar disso mostra um aviso, sem bloquear.
- Se o número for restringido, os envios param e o canal é reavaliado. Criar outra conta para contornar um bloqueio está fora de cogitação.

### Mensagens

**Primeiro contato, sem site:**

> Oi, tudo bem? Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Vi a [nome do negócio] no Google e não encontrei um site. Preparei um modelo de página com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.

**Primeiro contato, fora do ar:**

> Oi, tudo bem? Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Tentei abrir o site da [nome do negócio] e não consegui, então preparei um modelo de página com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.

**Primeiro contato, melhorar site:**

> Oi, tudo bem? Aqui é o Gabriel, faço sites para negócios locais em [cidade]. Vi o site da [nome do negócio] e notei um ponto que pode melhorar: [motivo]. Preparei um modelo novo com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.

**Follow-up:**

> Oi! Aqui é o Gabriel de novo. Queria saber se vocês conseguiram ver o modelo que preparei com os dados públicos de vocês: [link]. Se não fizer sentido, é só avisar que não mando mais mensagem.

### Sugestão de resposta

A IA só sugere, e o Gabriel copia o texto. Ela não promete preço, prazo ou condição. Quando o valor for necessário, a sugestão traz o campo `[valor]`, que o Gabriel preenche antes de copiar.

### Risco conhecido

A política do WhatsApp Business exige permissão para mensagens de empresa, e os termos do WhatsApp restringem usos não pessoais não autorizados. O envio manual reduz o risco de automação, mas não torna o contato frio plenamente conforme. A restrição do número é um risco aceito pelo Gabriel e deve ser acompanhada.

## 8. Clientes

Um lead vendido é cadastrado como cliente. Também é possível criar um cliente sem lead de origem.

- **Cliente:** nome ou razão social, CPF/CNPJ, responsável, e-mail, telefone, endereço e lead de origem.
- **Serviço:** um cliente tem vários. Nome, tipo (único ou recorrente), valor, data de início, observações e status (ativo, concluído ou cancelado).
- **Contrato:** um por serviço, criado como rascunho. Status: rascunho, enviado, assinado ou recusado.
- **Cobrança:** um serviço tem várias. Descrição, valor, vencimento, forma de pagamento (Pix, boleto ou cartão), status (pendente, pago, vencido ou cancelado) e link de pagamento.

### Assinatura pelo ZapSign

"Enviar para assinatura" gera o documento a partir de um modelo no ZapSign, com os dados do cliente e do serviço, e cria o link de assinatura. O status volta por webhook. Um contrato recusado pode ser reenviado. O texto do contrato é definido pelo Gabriel, e o envio só funciona depois que o modelo existir.

### Cobrança pelo Asaas

"Nova cobrança" cria a cobrança no Asaas. Serviço recorrente gera uma assinatura com periodicidade. O status volta por webhook. O Gabriel copia o link de pagamento e envia ao cliente, então os avisos automáticos do Asaas ficam desativados.

### Números

- **Faturado:** soma das cobranças emitidas, sem as canceladas.
- **Recebido:** soma das cobranças pagas.
- **Em aberto:** faturado menos recebido.
- **Em atraso:** soma das cobranças vencidas.
- **Situação do cliente:** em atraso se houver cobrança vencida; caso contrário, em dia.

### Ações sem tela própria

Editar cliente, concluir ou cancelar serviço, cancelar cobrança e reenviar contrato recusado ficam em um menu "…" na linha correspondente.

## 9. Dados e LGPD

- **Coleta:** só o necessário para abordar o negócio, a partir de fontes públicas. Nomes de autores de avaliações não são coletados.
- **Base legal pretendida:** legítimo interesse, com a análise registrada antes do primeiro contato.
- **Transparência:** cada contato diz quem é o remetente, de onde vieram os dados e como sair da lista.
- **Retenção:** leads sem resposta têm os dados removidos em 180 dias, restando só o necessário para não contatá-los de novo. Leads vendidos e clientes ficam fora dessa regra.
- **Revisão jurídica:** consultar um advogado antes de ultrapassar 500 contatos.

## 10. Arquitetura

Um único repositório, com o app e o worker.

| Parte | Tecnologia | Função |
|---|---|---|
| Painel e páginas de exemplo | Next.js na Vercel | Telas, modelos e webhooks |
| Dados e arquivos | Supabase | Banco, login, fotos e vídeos |
| Captação | Apify | Google Maps e Instagram, com retorno por webhook |
| Textos | API do Claude | Análise, textos da página e sugestões de resposta |
| Voz | ElevenLabs | Campos variáveis do roteiro |
| Contrato | ZapSign | Assinatura |
| Cobrança | Asaas | Cobranças, assinaturas e status de pagamento |
| Worker local | Node, Playwright e Remotion no Mac | Verifica sites, gera páginas e renderiza vídeos |

O app e o worker se comunicam por uma tabela de tarefas no Supabase. Se o Mac estiver desligado, as tarefas ficam na fila e continuam quando ele voltar.

### Tabelas

- `batches`: localização, tipo de negócio, quantidade, critérios, status e erro
- `leads`: dados do negócio, situação do site, fluxo, análise, motivo, comentário, pontuação e etapa
- `sites`: conteúdo gerado, código da URL, validade e status
- `videos`: status, progresso, arquivo, duração e erro
- `jobs`: fila de tarefas do worker
- `events`: histórico de contatos, aberturas, respostas e decisões
- `do_not_contact`: telefones e negócios que não podem ser contatados
- `clients`, `services`, `contracts` e `charges`: seção 8

## 11. Telas

| Tela | Conteúdo |
|---|---|
| Login | E-mail e senha |
| Overview | Pendências, números de prospecção, faturado, em aberto, funil e resultados por fluxo e por tipo de negócio |
| Batches | Lista, com filtro de localização, contagem por etapa, próxima ação e "Repetir" |
| Novo batch | Drawer em 3 passos |
| Revisar, Material, Abordar, Aguardar, Conversa e Vendido | Etapas de um batch, com a barra de etapas e as contagens dele |
| Lead | Dados, análise, motivo, comentário, material, histórico e ações |
| Clientes | Totais e lista |
| Cliente | Dados, resumo financeiro, serviços, contratos e cobranças, com os drawers Novo serviço e Nova cobrança |

Pendências que envolvem vários batches abrem a lista de Batches filtrada pela etapa.

## 12. Erros

- **Busca incompleta:** salva o que veio, mostra o erro e permite repetir sem duplicar leads.
- **Dados insuficientes:** a página não é gerada, e o lead fica marcado em Material.
- **Falha da IA ou da voz:** até 3 tentativas. Depois, o lead fica com erro e "Tentar de novo", sem travar o lote.
- **Mac desligado:** as tarefas ficam na fila.
- **Número inválido:** o Gabriel marca em Abordar, e o lead é descartado.
- **Falha no ZapSign ou no Asaas:** nada muda localmente, e a mensagem de erro aparece no drawer ou na linha.
- **Webhook repetido:** não duplica nem regride o status.

## 13. Testes

- **Automatizados:** normalização, deduplicação, classificação do site, regras do ICP, transições de etapa, bloqueio de `nao_contatar`, limite de follow-up, números financeiros e tratamento de webhooks.
- **Conteúdo:** leads de exemplo nos dois fluxos e com dados faltantes, para garantir que nenhum fato seja inventado e que nenhuma página quebre.
- **Manual antes do primeiro contato:** um lead fictício de cada fluxo percorre todo o caminho, com a página aberta no celular.
- **Integrações:** ZapSign e Asaas testados nos ambientes de teste antes de usar em produção.

## 14. Ordem de construção

1. **Base e captação:** projeto, login, batches, busca, verificação e análise.
2. **Revisar:** ICP e aprovação.
3. **Material sem vídeo:** template e geração.
4. **Contato:** Abordar e Aguardar.
5. **Vídeo:** configuração, voz e renderização, afinados com as gravações do Gabriel.
6. **Fechamento:** Conversa, Vendido e Lead.
7. **Clientes:** cadastro, serviços, ZapSign e Asaas.
8. **Overview e operação:** pendências, resultados, retenção e deploy.

O domínio é definido no deploy.

## 15. Em aberto

1. Modelo de contrato no ZapSign, definido pelo Gabriel
2. Confirmação do nome comercial: as telas usam Sharken
