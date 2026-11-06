# Prospecção de landing pages

Sistema de um único usuário para encontrar negócios locais, montar uma página de exemplo e um vídeo para cada um e apoiar a abordagem pelo WhatsApp até a venda ser registrada.

**Objetivo:** gerar caixa rápido, com pouco esforço operacional.

**Status:** o spec está em `docs/superpowers/specs/2026-11-06-sistema-de-prospeccao-design.md`. Ainda não há código. Só iniciar a implementação depois de haver um plano aprovado.

## Decisões

- **Escopo:** da busca até o registro da venda. Negociação, proposta, contrato, pagamento e entrega ficam com o Gabriel, fora do sistema.
- **Busca:** o Gabriel escolhe região e tipo de negócio, em campos livres. Definir nichos, preços, metas e testes comerciais é com ele.
- **Dois fluxos:** sem site (inclui site fora do ar) e melhorar site. Se o site funciona, o Gabriel avalia se está ruim; site bom sai da lista.
- **Templates:** um único template, que se adapta a qualquer tipo de negócio.
- **Primeiro contato:** WhatsApp. O app prepara o texto e o link, abre a conversa, e o Gabriel envia. Identificação clara, um follow-up no máximo e parar assim que a pessoa pedir. Sem disparo automático.
- **Depois:** se a abordagem funcionar, o Gabriel pode fazer um CRM conectado ao WhatsApp. Não faz parte desta versão.
- **Modo de operação:** human in the loop. A IA propõe e o Gabriel aprova ou reprova.
- **Vídeo:** módulo próprio, afinado aos poucos com o Gabriel, sem número mínimo de testes. Roteiro por fluxo, narração gravada por ele e clone de voz nos campos variáveis. Fica no topo da página de exemplo.
- **Duração do vídeo:** 60 a 90 segundos. O objetivo é conseguir uma resposta.
- **Transparência:** o vídeo pode mostrar que a demo foi preparada para aquele negócio, mas não deve dizer que o Gabriel gravou tudo pessoalmente para ele.
- **Sistema:** app próprio, de um único usuário, com painel para aprovar cada etapa. Construir só o que esta versão exige.
- **Stack:** TypeScript, Next.js na Vercel, Supabase, Apify, API do Claude, ElevenLabs e Remotion (renderizando no Mac do Gabriel na primeira versão).

## Restrições do WhatsApp (verificado em 2026-11-05)

- A política do WhatsApp Business exige que a pessoa tenha fornecido o número e dado permissão para receber mensagens. Número raspado não atende a isso.
- Os termos do WhatsApp proíbem mensagens em massa e automáticas não autorizadas, e a conta pode ser suspensa ou banida.
- Automação é permitida na API oficial dentro da janela de 24 horas após a mensagem da pessoa, com opção de falar com um humano.
- Não construir disparo frio automatizado nem rotação de números para evitar bloqueio.

## Em aberto

- Nome comercial usado nas mensagens e no aviso dos modelos
