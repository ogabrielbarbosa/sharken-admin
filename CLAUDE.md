# Sharken Admin

Sistema para encontrar negócios locais, montar uma página de exemplo e um vídeo para cada um, apoiar a abordagem pelo WhatsApp e, depois da venda, controlar clientes, serviços, contratos e cobranças.

**Objetivo:** gerar caixa rápido, com pouco esforço operacional.

**Status:** v2 implementada, com o batch reformulado como pipeline (spec `docs/superpowers/specs/2026-11-11-v2-pipeline-design.md`, plano `docs/superpowers/plans/2026-11-11-pipeline.md`; ela substitui o Leads/Completar/Material das specs abaixo). Specs em `docs/superpowers/specs/2026-11-11-v2-*.md` (visão geral, leads, material, crm, contrato, pagamento), plano da v2 em `docs/superpowers/plans/2026-11-11-v2.md`, telas em `untitled.pen` (frames "v2 · 01".."v2 · 12"). A primeira versão fica em `docs/superpowers/specs/2026-11-06-sistema-de-prospeccao-design.md`, substituída onde a v2 diz o contrário. Ambientes e comandos em `docs/ambientes.md`, operação em `docs/operacao.md`.

**Ambiente único:** um banco só, o Supabase da VPS (`supa-sharken` no Coolify), usado pelo `pnpm dev`, pela Vercel e pelo worker da VPS. O que se faz no local grava na produção. Um `.env` na raiz; `pnpm env:sync` leva para a Vercel e o Coolify; `pnpm db:migrate` aplica migrações por túnel SSH; publicar é `git push` na `main`. Migrações devem ser compatíveis com o código publicado (acrescentar antes de usar, remover depois). Nunca rodar comandos que apagam dados do banco sem o Gabriel pedir. O Supabase local antigo (Docker) não é mais usado; não rodar `supabase db reset`, `supabase stop --no-backup` ou `supabase stop --all` (há outros projetos Supabase na máquina).

## Decisões

- **Workspaces:** cada operação (o Gabriel e cada primo) é um workspace com os próprios batches, leads, conversas, conexão do WhatsApp (instância própria na Evolution), contatos, clientes, contratos e cobranças. O administrador da plataforma (`platform_admins`, o Gabriel) vê todos e troca pelo menu; os demais só veem o próprio workspace. Configurações (menu, abaixo de Clientes) guarda nome, quem fala nas mensagens (`[seu nome]`/`$meu_nome`), nome comercial, limite diário, membros, o catálogo de serviços, a chave da AbacatePay e o token do Apify. Membros entram por convite: o dono adiciona só o e-mail (`workspace_invites`), a pessoa cria a senha em `/cadastro` e cai direto no workspace; só e-mail convidado consegue criar conta. O servidor e o worker filtram pelo `scopeDb` (`packages/db/src/scope.ts`); o RLS por membro vale para o Realtime. `do_not_contact` é global. A AbacatePay usa a chave de cada workspace (`workspace_billing`, só o servidor lê), e o dinheiro cai na conta dele. O Apify usa o token de cada workspace (Configurações › Apify, `workspace_apify`, só o servidor lê): sem token não há batch, e o gasto sai da conta dele. ZapSign e Claude ainda usam as chaves do `.env` (contas do Gabriel) para todos.
- **Processo:** Batch (localização + tipo de negócio) → pipeline Novo lead → Qualificado → Página → Vídeo → Pronto para abordar, depois CRM global → Contrato → Pagamento. O batch é a unidade de trabalho até o Pronto para abordar; do CRM em diante o contato vale por si, com ou sem lead.
- **Busca:** localização e tipo de negócio em campos livres. Definir nichos, preços, metas e testes comerciais é com o Gabriel.
- **Dois fluxos:** sem site (inclui site fora do ar) e melhorar site. O sistema analisa, e o Gabriel revisa e decide em Leads.
- **Comentário e motivo:** o comentário é interno. O motivo é um campo próprio, que aparece para o lead na mensagem.
- **Página:** feita pelo Gabriel fora do sistema. O sistema não gera página; o link é colado no lead.
- **Vídeo:** gravado pelo Gabriel (Loom) fora do sistema. O link é colado no lead. Não há vídeo por IA.
- **Configuração:** mensagens e prompts de análise e de sugestão de resposta ficam em arquivos do projeto (`packages/config`), sem tela.
- **Primeiro contato:** WhatsApp pela Evolution API (não oficial), com uma instância própria para o número de prospecção. O Gabriel conversa no CRM do app; cada mensagem sai de um clique dele, um contato por vez. Identificação clara, no máximo um follow-up para quem nunca respondeu (o agendado só avisa) e parar assim que a pessoa pedir.
- **Modo de operação:** human in the loop. A IA propõe e o Gabriel aprova ou reprova.
- **Contatos do lead:** um lead pode ter vários contatos (números), cada um com sua conversa no CRM; um contato tem no máximo um lead. No quadro, o card de Pronto para abordar abre direto a conversa quando o lead tem um contato só; com vários (ou nenhum), abre a lista de conversas, onde dá para adicionar número. Um número perdido só tira o lead quando nenhum outro segue ativo; Não contatar vale para o negócio todo.
- **Clientes:** um cliente tem vários serviços, com contrato pelo ZapSign e cobrança pela AbacatePay. O CRM tem o botão "Fechar negócio" que leva ao contrato; nele, o catálogo do workspace (`service_catalog`, em Configurações › Serviços) preenche nome, valor e periodicidade.
- **Cobrança (AbacatePay, desde 2026-11-17):** cada cobrança vira um produto e um checkout na conta do workspace, e o link é copiado em Clientes. Serviço recorrente vira assinatura (cartão ou Pix Automático; boleto não tem assinatura lá). O webhook de cada workspace (`/api/webhooks/abacatepay/<workspace>`, segredo próprio) é registrado sozinho quando a chave é salva. A AbacatePay não avisa atraso: o cron `/api/cron/overdue` marca como vencida a pendente com vencimento passado. O Asaas ficou só para as cobranças antigas (webhook e cancelamento continuam funcionando).
- **Imagens do Instagram:** quando o lead vira Qualificado, o worker salva a foto de perfil e as imagens dos últimos 12 posts no Cloudflare R2 (`leads.instagram_media`), para montar a página. Detalhes em `docs/ambientes.md`.
- **MCP:** `https://admin.sharkenapps.com/api/mcp` dá a qualquer cliente MCP (claude.ai, app, Claude Code, Cursor) leitura de batches, leads (com imagens) e atendimentos dos workspaces do usuário. Login por OAuth 2.1 do Supabase Auth, com consentimento em `/oauth/consent`; o token OAuth não grava pela REST (migração 0020) e as ferramentas de leitura usam `readOnlyDb`. A única escrita (decisão do Gabriel em 2026-11-17) é a página do lead: `publicar_pagina` recebe o HTML que o agente montou com a skill e o template de cada um, grava em `pages`, devolve `https://pages.sharkenapps.com/<id>` e põe o link no lead; página grande vai por `preparar_upload_da_pagina` (link assinado + `curl` com o arquivo, sem redigitar o HTML); a expiração (horas, ou não expira) se ajusta por `alterar_expiracao_da_pagina`. Spec da leitura em `docs/superpowers/specs/2026-11-17-mcp-leitura-design.md`, configuração em `docs/ambientes.md`.
- **Stack:** TypeScript, Next.js na Vercel, Supabase, Cloudflare R2 (imagens), Apify (conta de cada workspace), API do Claude (só análise de leads e sugestão de resposta), Evolution API, ZapSign, AbacatePay (Asaas só nas cobranças antigas).

## Restrições do WhatsApp

- A conexão pela Evolution API não é oficial e pode levar ao banimento do número. O Gabriel aceitou esse risco em 2026-11-11. A política do WhatsApp Business (verificada em 2026-11-05) exige que a pessoa tenha fornecido o número e dado permissão; número raspado não atende a isso.
- Os termos do WhatsApp proíbem mensagens em massa e automáticas não autorizadas.
- Não construir envio em massa nem automático, nem rotação de números para evitar bloqueio. Uma mensagem por clique, um contato por vez, no máximo um follow-up para quem nunca respondeu, e parar assim que a pessoa pedir.
- O provedor fica atrás de uma interface (`packages/integrations/src/whatsapp/`), para trocar depois pela API oficial.
- Evolution API v2.3.7 (última estável em 2026-11-11). Roda na VPS (https://evo.sharkenapps.com); referência em `docs/evolution-api/`. A conexão do celular fica em Configurações › WhatsApp (o menu Atendimento abre direto as Conversas).
- CRM: o atendimento tem três estados, separados do status comercial: aberto, pendente (mensagem recebida num atendimento fechado, ou número novo) e fechado. Abrir um pendente o passa para aberto.

## Em aberto

- Nome comercial (as telas usam Sharken)
- Modelo de contrato no ZapSign
