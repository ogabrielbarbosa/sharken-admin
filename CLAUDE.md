# Prospecção de landing pages

Sistema de um único usuário para encontrar negócios locais, montar uma página de exemplo e um vídeo para cada um, apoiar a abordagem pelo WhatsApp e, depois da venda, controlar clientes, serviços, contratos e cobranças.

**Objetivo:** gerar caixa rápido, com pouco esforço operacional.

**Status:** v2 implementada. Specs em `docs/superpowers/specs/2026-11-11-v2-*.md` (visão geral, leads, material, crm, contrato, pagamento), plano em `docs/superpowers/plans/2026-11-11-v2.md`, telas em `untitled.pen` (frames "v2 · 01".."v2 · 12"). A primeira versão fica em `docs/superpowers/specs/2026-11-06-sistema-de-prospeccao-design.md`, substituída onde a v2 diz o contrário. Ambientes e comandos em `docs/ambientes.md`, operação em `docs/operacao.md`.

**Banco local:** nunca rodar `supabase db reset`, `supabase stop --no-backup` ou `supabase stop --all` sem o Gabriel pedir. Os dados locais devem ser preservados, e há outros projetos Supabase na máquina.

## Decisões

- **Processo:** Batch (localização + tipo de negócio) → Leads → Completar → Material, depois CRM global → Contrato → Pagamento. O batch é a unidade de trabalho até o Material; do CRM em diante o contato vale por si, com ou sem lead.
- **Busca:** localização e tipo de negócio em campos livres. Definir nichos, preços, metas e testes comerciais é com o Gabriel.
- **Dois fluxos:** sem site (inclui site fora do ar) e melhorar site. O sistema analisa, e o Gabriel revisa e decide em Leads.
- **Comentário e motivo:** o comentário é interno. O motivo é um campo próprio, que aparece para o lead na mensagem.
- **Página:** gerada por um agente no worker (API do Claude, custo por página no evento `pagina_gerada`), publicada em `PAGES_HOST` e válida 24 h após o envio (`PAGE_TTL_HOURS`).
- **Vídeo:** gravado pelo Gabriel e enviado por lead. O vídeo por IA (roteiro, ElevenLabs, Remotion) fica desligado, atrás de `VIDEO_MODE=ia`.
- **Configuração:** roteiros, mensagens, prompts e guia de design das páginas ficam em arquivos do projeto (`packages/config`), sem tela.
- **Primeiro contato:** WhatsApp pela Evolution API (não oficial), com uma instância própria para o número de prospecção. O Gabriel conversa no CRM do app; cada mensagem sai de um clique dele, um contato por vez. Identificação clara, no máximo um follow-up para quem nunca respondeu (o agendado só avisa) e parar assim que a pessoa pedir.
- **Modo de operação:** human in the loop. A IA propõe e o Gabriel aprova ou reprova.
- **Clientes:** um cliente tem vários serviços, com contrato pelo ZapSign e cobrança pelo Asaas. O CRM tem o botão "Fechar negócio" que leva ao contrato.
- **Stack:** TypeScript, Next.js na Vercel, Supabase, Apify, API do Claude, Evolution API, ZapSign, Asaas, e ElevenLabs e Remotion só no vídeo por IA (renderiza no Mac do Gabriel).

## Restrições do WhatsApp

- A conexão pela Evolution API não é oficial e pode levar ao banimento do número. O Gabriel aceitou esse risco em 2026-11-11. A política do WhatsApp Business (verificada em 2026-11-05) exige que a pessoa tenha fornecido o número e dado permissão; número raspado não atende a isso.
- Os termos do WhatsApp proíbem mensagens em massa e automáticas não autorizadas.
- Não construir envio em massa nem automático, nem rotação de números para evitar bloqueio. Uma mensagem por clique, um contato por vez, no máximo um follow-up para quem nunca respondeu, e parar assim que a pessoa pedir.
- O provedor fica atrás de uma interface (`packages/integrations/src/whatsapp/`), para trocar depois pela API oficial.

## Em aberto

- Nome comercial e domínio das páginas (as telas usam Sharken)
- Modelo de contrato no ZapSign
- Versão da Evolution API no servidor (v1 ou v2)
