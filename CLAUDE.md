# Prospecção de landing pages

Sistema de um único usuário para encontrar negócios locais, montar uma página de exemplo e um vídeo para cada um, apoiar a abordagem pelo WhatsApp e, depois da venda, controlar clientes, serviços, contratos e cobranças.

**Objetivo:** gerar caixa rápido, com pouco esforço operacional.

**Status:** primeira versão implementada. Spec em `docs/superpowers/specs/2026-11-06-sistema-de-prospeccao-design.md`, plano em `docs/superpowers/plans/2026-11-06-sistema-de-prospeccao.md`, telas em `untitled.pen`. Ambientes e comandos em `docs/ambientes.md`.

**Banco local:** nunca rodar `supabase db reset`, `supabase stop --no-backup` ou `supabase stop --all` sem o Gabriel pedir. Os dados locais devem ser preservados, e há outros projetos Supabase na máquina.

## Decisões

- **Processo:** o batch é a unidade de trabalho. Dentro dele, o lead segue Revisar → Material → Abordar → Aguardar → Conversa → Vendido.
- **Busca:** localização e tipo de negócio em campos livres. Definir nichos, preços, metas e testes comerciais é com o Gabriel.
- **Dois fluxos:** sem site (inclui site fora do ar) e melhorar site. O sistema analisa, e o Gabriel revisa e decide em Revisar.
- **Comentário e motivo:** o comentário é interno. O motivo é um campo próprio, que aparece para o lead na mensagem e no vídeo.
- **Templates:** um único template em código, que se adapta a qualquer tipo de negócio.
- **Configuração:** roteiros, mensagens, gravações e prompts ficam em arquivos do projeto, sem tela.
- **Primeiro contato:** WhatsApp. O app prepara o texto e o link, abre a conversa, e o Gabriel envia. Identificação clara, um follow-up no máximo e parar assim que a pessoa pedir. Sem disparo automático.
- **Depois:** se a abordagem funcionar, o Gabriel pode fazer um CRM conectado ao WhatsApp. Não faz parte desta versão.
- **Modo de operação:** human in the loop. A IA propõe e o Gabriel aprova ou reprova.
- **Vídeo:** gerado pelo worker, com roteiro por fluxo, narração gravada pelo Gabriel e clone de voz nos campos variáveis. Fica só dentro da página de exemplo.
- **Transparência:** o vídeo pode mostrar que a demo foi preparada para aquele negócio, mas não deve dizer que o Gabriel gravou tudo pessoalmente para ele.
- **Clientes:** um cliente tem vários serviços, com contrato pelo ZapSign e cobrança pelo Asaas.
- **Stack:** TypeScript, Next.js na Vercel, Supabase, Apify, API do Claude, ElevenLabs, ZapSign, Asaas e Remotion (renderizando no Mac do Gabriel na primeira versão).

## Restrições do WhatsApp (verificado em 2026-11-05)

- A política do WhatsApp Business exige que a pessoa tenha fornecido o número e dado permissão para receber mensagens. Número raspado não atende a isso.
- Os termos do WhatsApp proíbem mensagens em massa e automáticas não autorizadas, e a conta pode ser suspensa ou banida.
- Automação é permitida na API oficial dentro da janela de 24 horas após a mensagem da pessoa, com opção de falar com um humano.
- Não construir disparo frio automatizado nem rotação de números para evitar bloqueio.

## Em aberto

- Modelo de contrato no ZapSign
- Confirmação do nome comercial (as telas usam Sharken)
