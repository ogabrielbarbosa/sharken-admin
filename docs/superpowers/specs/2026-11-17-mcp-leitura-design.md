# MCP de leitura do Sharken Admin

Data: 2026-11-17 · Status: aprovado

## Por quê

O Gabriel quer ligar qualquer cliente MCP (claude.ai, Claude Desktop, Claude Code, Cursor) aos dados do Sharken
para analisar batches e atendimentos e, principalmente, alimentar uma skill dele que monta a página de exemplo do
lead a partir de um template que ele já tem. Hoje isso é feito copiando o briefing do lead à mão
(`buildBriefing`, "para colar no Claude Desktop"). O MCP troca o copiar e colar por acesso direto, com o login dele.

## Objetivos

- Endpoint MCP remoto em `https://admin.sharkenapps.com/api/mcp`, conectável em qualquer cliente que aceite MCP remoto.
- Login com o mesmo usuário do painel, por OAuth 2.1 (o claude.ai e o app só aceitam OAuth em conector remoto).
- Respeitar os workspaces: o administrador da plataforma (`platform_admins`) vê todos; os demais só o próprio.
- Analisar batches: listar batches, ver os leads de cada coluna do quadro, abrir tudo de um lead.
- Trazer as imagens do lead (Instagram no R2, fotos do Maps, imagens extraídas do material) de forma que o
  Claude as veja e tenha o link para usar na página.
- Analisar atendimentos: listar conversas do CRM e ler o histórico de uma conversa.

## Não objetivos

- Nada de escrita: não cria, altera, move nem apaga nada. Não envia mensagem, não gera página.
- Clientes, serviços, contratos e cobranças ficam de fora por agora.
- Tela para gerenciar ou revogar conexões OAuth (dá para revogar pelo Supabase; tela fica para depois).

## Antiobjetivos (falha mesmo funcionando)

- Um membro enxergar dado de outro workspace, por qualquer ferramenta ou id adivinhado.
- Existir qualquer caminho de escrita a partir do MCP.
- Vazar segredo: `workspace_billing` (chave da AbacatePay), tokens, chaves do `.env`.

## Abordagens consideradas

1. **OAuth 2.1 do próprio Supabase Auth (escolhida pelo Gabriel).** O `supa-sharken` roda Auth v2.186, que tem
   servidor OAuth 2.1 com descoberta e registro dinâmico de cliente, feito para MCP. Hoje está desligado. Ligamos
   e criamos só a tela de consentimento no Next.js. Pouco código, reaproveita o login atual, renovação de token
   fica com o Supabase.
2. Servidor OAuth próprio dentro do Next.js: mesmo resultado por fora, muito mais código e superfície de segurança.
   Só se o (1) falhar.
3. Token pessoal no cabeçalho: descartado, não conecta no claude.ai nem no app.

Onde roda: rota do Next.js na Vercel (sai no `git push`, usa o mesmo `@lps/db`). O worker da VPS não tem motivo
para hospedar isso.

## Desenho

### Autenticação

- **Supabase Auth (Coolify, serviço `supa-sharken`):** ligar o servidor OAuth 2.1 com registro dinâmico de cliente
  e apontar o caminho de autorização para a tela de consentimento do Sharken
  (`https://admin.sharkenapps.com/oauth/consent`). Isso exige mudar variáveis do container de auth e reiniciá-lo:
  **confirmar com o Gabriel antes de reiniciar.** Conferir na documentação do Supabase os nomes exatos das variáveis
  (`GOTRUE_OAUTH_SERVER_*`) e se o `SITE_URL` do serviço afeta a URL de autorização. A descoberta deve responder em
  `https://supa-sharken.sharkenapps.com/.well-known/oauth-authorization-server/auth/v1` (passa pelo Kong; conferir
  que a rota está exposta).
- **Tela `/oauth/consent` (Next.js):** recebe o `authorization_id`, exige login (sem sessão vai para `/login` e volta),
  mostra o nome do cliente que pede acesso e o que ele vai ver ("ler batches, leads e conversas dos seus
  workspaces, sem alterar nada"), com Autorizar e Recusar. Usa a API OAuth do supabase-js (detalhes da autorização,
  aprovar, negar). Visual igual ao `/login`.
- **Recurso protegido:** `/api/mcp` responde 401 com `WWW-Authenticate` apontando para
  `/.well-known/oauth-protected-resource` (no domínio do admin), que indica o Supabase como servidor de autorização.
- **Validação do token:** a cada requisição, validar o JWT do Supabase (assinatura/expiração; `auth.getUser(token)`
  ou JWKS), pegar o `user.id`, e daí `isPlatformAdmin` e `listUserWorkspaces` (`packages/db/src/scope.ts`).
  O conjunto de workspaces acessíveis é o que todas as ferramentas usam.

### Acesso aos dados

- Leitura com o cliente admin (service role) **filtrado pelos workspaces acessíveis**, como o painel já faz com
  `scopeDb`. Ferramentas de lista aceitam `workspace` opcional; sem ele, varrem todos os workspaces acessíveis e
  cada item diz de qual workspace é. Ferramentas que recebem um id buscam a linha, conferem que o `workspace_id`
  dela está entre os acessíveis e, se não estiver, respondem "não encontrado" (não "sem permissão").
- **Somente leitura garantida no código, não só por convenção:** um proxy de cliente só de leitura (como o
  `scopeDb`) que lança erro em `insert`, `update`, `upsert`, `delete` e `rpc`. Todas as ferramentas usam esse cliente.
  Toda ferramenta declara `readOnlyHint: true`.
- **O token do OAuth também não escreve (decidido pelo Gabriel).** O token que o cliente MCP guarda é uma sessão
  `authenticated` comum, e as políticas da `0014_workspaces.sql` (`<tabela>_member`, `for all`) deixam qualquer
  membro gravar pela REST do Supabase, sem passar pelo MCP. Migração nova acrescenta, em todas as tabelas com
  política de membro (as de `WORKSPACE_TABLES` e as demais que `authenticated` consegue gravar), políticas
  **restrictive** para `insert`, `update` e `delete` que recusam quando o JWT traz o claim `client_id` (tokens
  emitidos pelo servidor OAuth). Sessão do painel (sem `client_id`) e service role (ignora RLS) seguem iguais, então
  a migração é compatível com o código publicado. Conferir na documentação do Supabase o nome exato do claim. Teste:
  com um JWT que tem `client_id`, select funciona e insert/update/delete falham; sem o claim, nada muda.
  Risco aceito: esse token ainda consegue chamar `PUT /auth/v1/user` (trocar senha/e-mail); o banco não bloqueia isso.
- Tabelas que o MCP nunca lê: `workspace_billing`, `workspace_invites`, `jobs`, e qualquer coisa de clientes,
  contratos e cobranças.
- Texto que vem de terceiros (avaliações, legendas, mensagens do WhatsApp, texto extraído de sites) é dado, não
  instrução: as respostas o marcam como conteúdo externo, para o modelo do cliente não obedecer o que estiver ali.

### Ferramentas

Nomes em português, como o resto do sistema. Colunas usam `PIPELINE_COLUMNS` (`packages/domain/src/stages.ts`):
`novo`, `qualificado`, `pagina`, `video`, `pronto`, `descartados`.

| Ferramenta | Entrada | Devolve |
|---|---|---|
| `listar_workspaces` | (nada) | workspaces acessíveis: id, nome, slug, papel |
| `listar_batches` | `workspace?`, `status?`, `limite?` | batches (local, tipo de negócio, quantidade, status, data) com a contagem de leads por coluna |
| `ver_batch` | `batch_id` | o batch e seus leads agrupados por coluna, cada lead em resumo |
| `listar_leads` | `batch_id?`, `coluna?`, `workspace?`, `busca?` (nome/cidade), `limite?`, `cursor?` | leads em resumo |
| `ver_lead` | `lead_id` | tudo do lead + material (`lead_assets` prontos) + `instagram_media` + fotos + contatos ligados (número, status, estado do atendimento) + o briefing em Markdown (`buildBriefing`) |
| `ver_imagens_do_lead` | `lead_id`, `origem?` (`instagram`, `fotos`, `material`, `todas`), `limite?` (padrão 8, máx. ~20) | as imagens em si (blocos de imagem, para o Claude ver) e, para cada uma, o link público e a legenda/origem, para usar na página |
| `listar_atendimentos` | `workspace?`, `estado?` (aberto/pendente/fechado), `status?` (comercial), `batch_id?`, `limite?`, `cursor?` | conversas: contato, número, status, estado, última mensagem, não lidas, lead ligado |
| `ver_atendimento` | `contact_id`, `limite?` (padrão 100 mensagens mais recentes) | contato, resumo do lead ligado, notas internas, mensagens em ordem (direção, tipo, texto, horário, status) e mídias por link assinado de curta duração |

**Lead em resumo:** id, nome, coluna e etapa, fluxo, score, cidade, tipo, telefone, site, Instagram, se já tem
imagens do Instagram, `page_url`, `loom_url`, número de contatos, data da última mudança de etapa.

**Imagens:** as do Instagram e as fotos têm link público (R2 e Maps). O MCP baixa e devolve como imagem
(redimensionar se passar de ~1 MB, para não estourar o contexto do cliente) e sempre devolve junto o link
original, que é o que vai na página. Imagem que falhar ao baixar vira só o link, com o aviso.

**Imagens do material (`lead_assets.extracted_images`):** são caminhos no bucket privado `lead-assets`
(`<lead>/extraidas/<asset>-<i>.ext`). O MCP devolve a imagem e um link assinado curto, marcado como
"temporário, não usar na página" (decisão do builder, aceita pelo Gabriel). Levar essas imagens para o R2, para
terem link permanente, é mudança separada no worker, fora deste trabalho. Na mesma linha, o briefing
(`buildBriefing`, seção "Fotos") hoje mistura esses caminhos internos com os links do Maps: o `ver_lead` passa a
trocar o caminho pelo link assinado com o mesmo aviso, e o briefing do painel ganha a mesma correção.

**Mídias do WhatsApp:** ficam no bucket privado; o MCP gera link assinado (1 hora) e não embute o arquivo.

### Implementação

- Rota `apps/web/src/app/api/mcp/route.ts`, transporte Streamable HTTP, sem estado. Biblioteca oficial
  `@modelcontextprotocol/sdk` (com o `mcp-handler` da Vercel, se simplificar a rota no Next.js).
- Consultas novas de leitura em `packages/db` (reaproveitando `batches.ts`, `leads.ts`, `contacts.ts`,
  `messages.ts`, `lead-assets.ts`, `overview.ts` onde já existir algo pronto).
- Testes: escopo (membro não acha lead/batch/contato de outro workspace; admin acha todos), cliente só de leitura
  lança erro em escrita, formato das respostas das ferramentas, token inválido/ausente responde 401 com o cabeçalho.
- Documentação: seção em `docs/ambientes.md` (como conectar em cada cliente, variáveis ligadas no Supabase) e linha
  nas Decisões do `CLAUDE.md`.

## O que fica com quem constrói

Escolha da biblioteca de MCP, paginação (cursor), formato exato do texto de cada resposta, como redimensionar
imagem, onde fica o proxy só de leitura e os nomes das funções de consulta.
